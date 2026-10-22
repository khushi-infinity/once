import AppKit
import CoreGraphics
import Foundation

struct WindowCapture: Sendable {
    let png: Data
    let appName: String
    let windowTitle: String
}

enum WindowCaptureError: LocalizedError {
    case permission
    case noWindow
    case captureFailed(String)

    var errorDescription: String? {
        switch self {
        case .permission:
            return "Screen Recording permission is off. Open System Settings, Privacy & Security, Screen Recording, and enable ONCE Window Guide."
        case .noWindow:
            return "I could not find a visible window. Open the app you want to ask about, then try again."
        case .captureFailed(let message):
            return "The window capture failed. \(message)"
        }
    }
}

enum WindowCaptureService {
    /// Capture the topmost visible window that does not belong to this menu bar app.
    ///
    /// `screencapture` performs the actual pixel capture so the app needs only
    /// the standard macOS Screen Recording permission. The screenshot is kept
    /// in a temporary file only for the duration of this function.
    static func captureTopWindow() throws -> WindowCapture {
        guard CGPreflightScreenCaptureAccess() else {
            _ = CGRequestScreenCaptureAccess()
            throw WindowCaptureError.permission
        }

        let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
        guard let windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
            throw WindowCaptureError.noWindow
        }

        let ownPID = ProcessInfo.processInfo.processIdentifier
        for info in windows {
            guard let ownerPID = info[kCGWindowOwnerPID as String] as? NSNumber,
                  ownerPID.int32Value != ownPID,
                  let layer = info[kCGWindowLayer as String] as? NSNumber,
                  layer.intValue == 0,
                  let number = info[kCGWindowNumber as String] as? NSNumber,
                  let boundsDict = info[kCGWindowBounds as String] as? [String: Any],
                  let bounds = CGRect(dictionaryRepresentation: boundsDict as CFDictionary),
                  bounds.width >= 240,
                  bounds.height >= 160
            else {
                continue
            }

            if let alpha = info[kCGWindowAlpha as String] as? NSNumber, alpha.doubleValue <= 0.01 {
                continue
            }

            let owner = (info[kCGWindowOwnerName as String] as? String) ?? "App"
            if ["Window Server", "Dock", "Control Center", "Notification Center"].contains(owner) {
                continue
            }
            let title = (info[kCGWindowName as String] as? String) ?? ""

            let temp = FileManager.default.temporaryDirectory
                .appendingPathComponent("once-window-\(UUID().uuidString).png")
            defer { try? FileManager.default.removeItem(at: temp) }

            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
            process.arguments = ["-x", "-o", "-l", String(number.intValue), temp.path]
            let errorPipe = Pipe()
            process.standardError = errorPipe
            do {
                try process.run()
                process.waitUntilExit()
            } catch {
                throw WindowCaptureError.captureFailed(error.localizedDescription)
            }
            guard process.terminationStatus == 0 else {
                let data = errorPipe.fileHandleForReading.readDataToEndOfFile()
                let message = String(data: data, encoding: .utf8)?
                    .trimmingCharacters(in: .whitespacesAndNewlines) ?? "screencapture exited with \(process.terminationStatus)"
                throw WindowCaptureError.captureFailed(message)
            }
            guard let png = try? Data(contentsOf: temp), png.count > 1_000 else {
                throw WindowCaptureError.captureFailed("the captured image was empty")
            }
            return WindowCapture(png: png, appName: owner, windowTitle: title)
        }

        throw WindowCaptureError.noWindow
    }
}
