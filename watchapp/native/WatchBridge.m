#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

// Exports the Swift class WatchBridgeImpl to React Native as "WatchBridge"
@interface RCT_EXTERN_MODULE(WatchBridge, RCTEventEmitter)

RCT_EXTERN_METHOD(sendUpdate:(NSDictionary *)data)

@end
