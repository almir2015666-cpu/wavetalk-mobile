import SwiftUI

@main
struct WaveTalkWatchApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(WatchSession.shared)
        }
    }
}
