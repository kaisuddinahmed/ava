import { DEFAULT_CONFIG, WidgetConfig } from "../config.js";
import { FISMBridge } from "./ws-transport.js";
import { BehaviorCollector } from "./collector.js";

export function initShopAssist(config: Partial<WidgetConfig>): {
  bridge: FISMBridge;
  collector: BehaviorCollector;
} {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // Create bridge
  const bridge = new FISMBridge(fullConfig.websocketUrl, fullConfig.sessionId);
  bridge.connect();

  // Create and start collector
  const collector = new BehaviorCollector(bridge, fullConfig.sessionId, fullConfig.userId);
  collector.startCollecting();

  return { bridge, collector };
}
