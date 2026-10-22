import SwiftUI

@main
struct OnceWindowApp: App {
    @StateObject private var model = GuideModel()

    var body: some Scene {
        MenuBarExtra("ONCE Window Guide", systemImage: "eye") {
            GuideView(model: model)
        }
        .menuBarExtraStyle(.window)
    }
}

struct GuideView: View {
    @ObservedObject var model: GuideModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                header
                questionBox
                actionRow
                if !model.windowLabel.isEmpty {
                    Text(model.windowLabel)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                if let error = model.errorMessage {
                    message(error, color: .red)
                }
                if !model.answer.isEmpty {
                    answerCard
                }
                if model.savedSkillId != nil {
                    saveCard
                }
                privacyNote
            }
            .padding(16)
        }
        .frame(width: 460, height: 650)
        .onAppear { model.refreshPermission() }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "eye.circle.fill")
                .font(.system(size: 30))
                .foregroundStyle(Color.accentColor)
            VStack(alignment: .leading, spacing: 2) {
                Text("ONCE Window Guide")
                    .font(.headline)
                Text("Ask about the app in front of you. I only capture the window when you press the button.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var questionBox: some View {
        VStack(alignment: .leading, spacing: 6) {
            TextField("Where is Export? How do I open Settings?", text: $model.question)
                .textFieldStyle(.roundedBorder)
                .onSubmit { model.lookAtWindow() }
            Text("Examples: Where is the export button? How do I find this file? How do I open this in another app?")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private var actionRow: some View {
        HStack(spacing: 8) {
            Button {
                model.lookAtWindow()
            } label: {
                Label(model.busy ? "Looking..." : "Look at this window", systemImage: "viewfinder")
            }
            .buttonStyle(.borderedProminent)
            .disabled(model.busy)

            Button {
                model.toggleListening()
            } label: {
                Label(model.listening ? "Stop" : "Talk", systemImage: model.listening ? "stop.circle" : "mic")
            }
            .help(model.listening ? "Stop listening" : "Ask by voice")
            .disabled(model.busy)

            Button {
                model.speak()
            } label: {
                Image(systemName: "speaker.wave.2")
            }
            .help("Speak the answer")
            .disabled(model.answer.isEmpty)

            if model.busy {
                ProgressView()
                    .controlSize(.small)
            }
            Spacer()
        }
    }

    private var answerCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Answer")
                    .font(.subheadline.bold())
                Spacer()
                if !model.confidence.isEmpty {
                    Text(model.confidence.uppercased())
                        .font(.caption2.bold())
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(model.confidence == "low" ? Color.orange.opacity(0.18) : Color.accentColor.opacity(0.12))
                        .clipShape(Capsule())
                }
            }
            Text(model.answer)
                .font(.body)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)

            if !model.steps.isEmpty {
                Divider()
                Text("Steps")
                    .font(.subheadline.bold())
                ForEach(model.steps) { step in
                    HStack(alignment: .top, spacing: 8) {
                        Text("\(step.order + 1).")
                            .font(.caption.bold())
                            .foregroundStyle(.secondary)
                            .frame(width: 18, alignment: .trailing)
                        Text(step.instruction)
                            .font(.callout)
                            .textSelection(.enabled)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }

            if !model.engineLabel.isEmpty {
                Text("Engine: \(model.engineLabel)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Divider()
            HStack(spacing: 8) {
                Button("Save as skill") { model.saveAsSkill() }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.busy)
                Button("Save SKILL.md for AI agents") { model.saveAgentSkill() }
                    .buttonStyle(.bordered)
                    .disabled(model.busy || model.savedSkillId == nil)
            }
        }
        .padding(12)
        .background(Color.secondary.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var saveCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Saved: \(model.savedSkillTitle)")
                .font(.callout.bold())
            if let folder = model.agentSkillFolder {
                Text(folder)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
                    .textSelection(.enabled)
            }
            HStack {
                Button("Open in ONCE") { model.openSkillInONCE() }
                if model.agentSkillFolder != nil {
                    Button("Show agent folder") { model.openAgentSkillFolder() }
                }
            }
            .buttonStyle(.link)
        }
    }

    private var privacyNote: some View {
        VStack(alignment: .leading, spacing: 6) {
            Divider()
            Text("Privacy: the screenshot is sent only to your ONCE backend for this question. It is not saved by the backend. The saved SKILL.md contains only the answer you approved, not the screenshot.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if !model.hasScreenPermission {
                HStack {
                    Text("Screen Recording permission is off.")
                        .font(.caption.bold())
                        .foregroundStyle(.orange)
                    Button("Open Settings") { model.openScreenRecordingSettings() }
                        .buttonStyle(.link)
                        .font(.caption)
                }
            }
        }
    }

    private func message(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(color)
            .fixedSize(horizontal: false, vertical: true)
    }
}
