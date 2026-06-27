import WatchConnectivity
import SwiftUI

class WatchSession: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchSession()

    @Published var channel: String = "—"
    @Published var speaker: String = ""
    @Published var talking: Bool   = false
    @Published var members: Int    = 0
    @Published var reachable: Bool = false

    private override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func sendPTTStart() {
        guard WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(["action": "ptt:start"], replyHandler: nil, errorHandler: nil)
    }

    func sendPTTStop() {
        guard WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(["action": "ptt:stop"], replyHandler: nil, errorHandler: nil)
    }

    // MARK: - WCSessionDelegate

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        DispatchQueue.main.async {
            if let ch = message["channel"] as? String { self.channel = ch }
            if let sp = message["speaker"] as? String { self.speaker = sp }
            if let tk = message["talking"]  as? Bool  { self.talking = tk }
            if let mb = message["members"]  as? Int   { self.members = mb }
        }
    }

    func session(_ session: WCSession,
                 activationDidCompleteWith state: WCSessionActivationState,
                 error: Error?) {
        DispatchQueue.main.async {
            self.reachable = (state == .activated)
        }
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async { self.reachable = session.isReachable }
    }
}
