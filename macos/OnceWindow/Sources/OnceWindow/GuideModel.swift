import AppKit
import AVFoundation
import Foundation
import Speech

struct WindowGuideStep: Decodable, Identifiable {
    let order: Int
    let instruction: String

    var id: Int { order }
}

struct GuideEngine: Decodable {
    let provider: String
    let model: String?
    let durationMs: Int?
    let fallbackFrom: String?
}

struct WindowGuideResponse: Decodable {
    let answer: String
    let steps: [WindowGuideStep]
    let confidence: String
    let appName: String?
    let windowTitle: String?
    let engine: GuideEngine?
}

struct SavedSkill: Decodable {
    let skillId: String
    let title: String
}

private struct APIError: Decodable {
    let detail: String
}

enum GuideError: LocalizedError {
    case server(String)
    case badResponse
    case noCapture
    case noSavedSkill

    var errorDescription: String? {
        switch self {
        case .server(let detail):
            return detail
        case .badResponse:
            return "The ONCE backend returned an unexpected response."
        case .noCapture:
            return "Look at a window first."
        case .noSavedSkill:
            return "Save the answer as a skill first."
        }
    }
}

@MainActor
final class GuideModel: ObservableObject {
    @Published var question = ""
    @Published var answer = ""
    @Published var steps: [WindowGuideStep] = []
    @Published var status = "Ask about the app in front of you."
    @Published var errorMessage: String?
    @Published var busy = false
    @Published var windowLabel = ""
    @Published var confidence = ""
    @Published var engineLabel = ""
    @Published var savedSkillId: String?
    @Published var savedSkillTitle = ""
    @Published var agentSkillFolder: String?
    @Published var hasScreenPermission = false
    @Published var listening = false

    private let baseURL: URL
    private let webURL: URL
    private let speech = AVSpeechSynthesizer()
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var tapInstalled = false
    private var lastCapture: WindowCapture?

    init() {
        let raw = ProcessInfo.processInfo.environment["ONCE_API_URL"] ?? "http://localhost:8000"
        baseURL = URL(string: raw) ?? URL(string: "http://localhost:8000")!
        let rawWeb = ProcessInfo.processInfo.environment["ONCE_WEB_URL"] ?? "http://localhost:3000"
        webURL = URL(string: rawWeb) ?? URL(string: "http://localhost:3000")!
        hasScreenPermission = CGPreflightScreenCaptureAccess()
    }

    func lookAtWindow() {
        let trimmed = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 3 else {
            errorMessage = "Ask a short question first, for example: Where is Export?"
            return
        }
        guard !busy else { return }

        busy = true
        errorMessage = nil
        answer = ""
        steps = []
        confidence = ""
        engineLabel = ""
        savedSkillId = nil
        savedSkillTitle = ""
        agentSkillFolder = nil
        status = "Looking at the window in front of you..."

        Task {
            do {
                let capture = try await Task.detached(priority: .userInitiated) {
                    try WindowCaptureService.captureTopWindow()
                }.value
                lastCapture = capture
                windowLabel = "\(capture.appName)\(capture.windowTitle.isEmpty ? "" : " · \(capture.windowTitle)")"
                hasScreenPermission = true

                let response = try await requestGuide(capture: capture, question: trimmed)
                answer = response.answer
                steps = response.steps
                confidence = response.confidence
                if let engine = response.engine {
                    let model = engine.model.map { " · \($0)" } ?? ""
                    let fallback = engine.fallbackFrom.map { " · fallback from \($0)" } ?? ""
                    engineLabel = "\(engine.provider)\(model)\(fallback)"
                }
                status = response.confidence == "low"
                    ? "Low confidence. Check the answer in the window before acting."
                    : "Answered from the window in front of you."
                speak()
            } catch {
                errorMessage = error.localizedDescription
                status = "Could not read the window."
                hasScreenPermission = CGPreflightScreenCaptureAccess()
            }
            busy = false
        }
    }

    func toggleListening() {
        if listening {
            stopListening()
            return
        }
        errorMessage = nil
        status = "Requesting microphone and speech access..."
        SFSpeechRecognizer.requestAuthorization { [weak self] speechStatus in
            DispatchQueue.main.async {
                guard let self else { return }
                guard speechStatus == .authorized else {
                    self.errorMessage = "Speech recognition is not authorized. Enable it in System Settings, Privacy & Security, Speech Recognition."
                    self.status = "Speech recognition is off."
                    return
                }
                AVCaptureDevice.requestAccess(for: .audio) { granted in
                    DispatchQueue.main.async {
                        guard granted else {
                            self.errorMessage = "Microphone access is off. Enable ONCE Window Guide in System Settings, Privacy & Security, Microphone."
                            self.status = "Microphone is off."
                            return
                        }
                        self.startListening()
                    }
                }
            }
        }
    }

    private func startListening() {
        guard let recognizer = speechRecognizer, recognizer.isAvailable else {
            errorMessage = "Speech recognition is not available right now."
            return
        }
        stopListening()
        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        recognitionRequest?.shouldReportPartialResults = true
        // Keep audio on this Mac. If the on-device model is unavailable, the
        // helper reports that instead of silently uploading the microphone.
        recognitionRequest?.requiresOnDeviceRecognition = true
        guard let request = recognitionRequest else { return }

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            errorMessage = "No microphone input was found."
            return
        }
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }
        tapInstalled = true
        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            stopListening()
            errorMessage = "Could not start the microphone: \(error.localizedDescription)"
            return
        }
        listening = true
        status = "Listening. Ask about the window, then press the eye."
        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            DispatchQueue.main.async {
                guard let self else { return }
                if let result {
                    self.question = result.bestTranscription.formattedString
                    if result.isFinal {
                        self.stopListening()
                        self.status = "Heard your question. Press Look at this window."
                    }
                }
                if error != nil {
                    self.stopListening()
                }
            }
        }
    }

    private func stopListening() {
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        if tapInstalled {
            audioEngine.inputNode.removeTap(onBus: 0)
            tapInstalled = false
        }
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionRequest = nil
        recognitionTask = nil
        listening = false
    }

    func speak() {
        guard !answer.isEmpty else { return }
        speech.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: answer)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = 0.48
        speech.speak(utterance)
    }

    func saveAsSkill() {
        guard let capture = lastCapture, !answer.isEmpty else {
            errorMessage = GuideError.noCapture.localizedDescription
            return
        }
        guard !busy else { return }
        busy = true
        errorMessage = nil
        status = "Saving this as a skill..."
        let title = String("\(capture.appName): \(question.trimmingCharacters(in: .whitespacesAndNewlines))".prefix(200))

        Task {
            do {
                let saved = try await createSkill(capture: capture, title: title)
                savedSkillId = saved.skillId
                savedSkillTitle = saved.title
                status = "Saved as a skill. It is in your ONCE library."
            } catch {
                errorMessage = error.localizedDescription
                status = "The skill was not saved."
            }
            busy = false
        }
    }

    func saveAgentSkill() {
        guard let skillId = savedSkillId, !savedSkillTitle.isEmpty else {
            errorMessage = GuideError.noSavedSkill.localizedDescription
            return
        }
        guard !busy else { return }
        busy = true
        errorMessage = nil
        status = "Writing SKILL.md for your AI agent..."

        Task {
            do {
                let markdown = try await fetchAgentSkill(skillId: skillId)
                let folder = try writeAgentSkill(markdown: markdown, skillId: skillId)
                agentSkillFolder = folder.path
                status = "Saved SKILL.md for AI agents."
                NSWorkspace.shared.activateFileViewerSelecting([folder])
            } catch {
                errorMessage = error.localizedDescription
                status = "The agent skill was not saved."
            }
            busy = false
        }
    }

    func openAgentSkillFolder() {
        guard let path = agentSkillFolder else { return }
        NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
    }

    func openSkillInONCE() {
        guard let skillId = savedSkillId else { return }
        let url = webURL.appendingPathComponent("skills/\(skillId)")
        NSWorkspace.shared.open(url)
    }

    func refreshPermission() {
        hasScreenPermission = CGPreflightScreenCaptureAccess()
    }

    func openScreenRecordingSettings() {
        guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture") else {
            return
        }
        NSWorkspace.shared.open(url)
        hasScreenPermission = CGPreflightScreenCaptureAccess()
    }

    private func requestGuide(capture: WindowCapture, question: String) async throws -> WindowGuideResponse {
        let boundary = "ONCE-\(UUID().uuidString)"
        var request = URLRequest(url: baseURL.appendingPathComponent("api/window/guide"))
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = multipartBody(
            boundary: boundary,
            capture: capture,
            question: question
        )

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw GuideError.badResponse
        }
        guard (200...299).contains(http.statusCode) else {
            if let apiError = try? decoder().decode(APIError.self, from: data) {
                throw GuideError.server(apiError.detail)
            }
            throw GuideError.server("ONCE returned HTTP \(http.statusCode).")
        }
        return try decoder().decode(WindowGuideResponse.self, from: data)
    }

    private func createSkill(capture: WindowCapture, title: String) async throws -> SavedSkill {
        let stepRows: [[String: Any]]
        if steps.isEmpty {
            stepRows = [[
                "order": 0,
                "instruction": String(answer.prefix(900))
            ]]
        } else {
            stepRows = steps.map { step in
                ["order": step.order, "instruction": step.instruction]
            }
        }
        let payload: [String: Any] = [
            "owner_id": "demo-teacher",
            "title": title,
            "type": "desktop_workflow",
            "source": "screen_demo",
            "summary": String(answer.prefix(1000)),
            "steps": stepRows
        ]
        var request = URLRequest(url: baseURL.appendingPathComponent("api/skills"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw GuideError.badResponse
        }
        guard (200...299).contains(http.statusCode) else {
            if let apiError = try? decoder().decode(APIError.self, from: data) {
                throw GuideError.server(apiError.detail)
            }
            throw GuideError.server("ONCE returned HTTP \(http.statusCode).")
        }
        return try decoder().decode(SavedSkill.self, from: data)
    }

    private func fetchAgentSkill(skillId: String) async throws -> String {
        var components = URLComponents(
            url: baseURL.appendingPathComponent("api/skills/\(skillId)/agent-skill"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [URLQueryItem(name: "reader_id", value: "demo-teacher")]
        guard let url = components?.url else { throw GuideError.badResponse }
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw GuideError.server("Could not download SKILL.md.")
        }
        guard let markdown = String(data: data, encoding: .utf8) else {
            throw GuideError.badResponse
        }
        return markdown
    }

    private func writeAgentSkill(markdown: String, skillId: String) throws -> URL {
        let folder = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/ONCE/agent-skills", isDirectory: true)
            .appendingPathComponent(Self.slug(savedSkillTitle), isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try markdown.write(
            to: folder.appendingPathComponent("SKILL.md"),
            atomically: true,
            encoding: .utf8
        )
        let source: [String: String] = [
            "skill_id": skillId,
            "title": savedSkillTitle,
            "saved_at": ISO8601DateFormatter().string(from: Date()),
            "source": "ONCE Window Guide"
        ]
        let data = try JSONSerialization.data(withJSONObject: source, options: [.prettyPrinted, .sortedKeys])
        try data.write(to: folder.appendingPathComponent("once-window-source.json"))
        return folder
    }

    private func multipartBody(boundary: String, capture: WindowCapture, question: String) -> Data {
        var body = Data()
        func text(_ value: String) {
            body.append(Data(value.utf8))
        }
        func field(_ name: String, _ value: String) {
            text("--\(boundary)\r\n")
            text("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
            text(value)
            text("\r\n")
        }
        field("question", question)
        field("app_name", capture.appName)
        field("window_title", capture.windowTitle)
        text("--\(boundary)\r\n")
        text("Content-Disposition: form-data; name=\"file\"; filename=\"window.png\"\r\n")
        text("Content-Type: image/png\r\n\r\n")
        body.append(capture.png)
        text("\r\n--\(boundary)--\r\n")
        return body
    }

    private func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }

    private static func slug(_ value: String) -> String {
        var out = ""
        var lastDash = false
        for scalar in value.lowercased().unicodeScalars {
            if CharacterSet.alphanumerics.contains(scalar) {
                out.unicodeScalars.append(scalar)
                lastDash = false
            } else if !lastDash {
                out.append("-")
                lastDash = true
            }
        }
        let trimmed = out.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return String((trimmed.isEmpty ? "once-skill" : trimmed).prefix(64))
    }
}
