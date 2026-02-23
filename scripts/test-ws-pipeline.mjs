/**
 * AVA End-to-End WebSocket Pipeline Test
 * Simulates: Widget connect → Track events → Evaluate → Intervene
 *
 * Message format matches WsWidgetMessageSchema:
 * { type: "track", visitorKey, siteUrl, deviceType, event: {...} }
 */
import WebSocket from 'ws';

const WS_URL = 'ws://localhost:8081';
const VISITOR_KEY = `visitor_${Date.now()}`;
const SESSION_KEY = `sess_${Date.now()}`;
const SITE_URL = 'https://demo-store.example';

function log(tag, msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [${tag}] ${typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2)}`);
}

function sendTrack(ws, event) {
  const msg = {
    type: 'track',
    visitorKey: VISITOR_KEY,
    sessionKey: SESSION_KEY,
    siteUrl: SITE_URL,
    deviceType: 'desktop',
    referrerType: 'organic',
    visitorId: 'vis_test_001',
    isLoggedIn: true,
    isRepeatVisitor: true,
    event,
  };
  log('SEND', `track → ${event.event_type || event.category}: friction=${event.friction_id || 'none'}`);
  ws.send(JSON.stringify(msg));
}

function sendOutcome(ws, interventionId, status) {
  const msg = {
    type: 'intervention_outcome',
    intervention_id: interventionId,
    session_id: SESSION_KEY,
    status,
    timestamp: Date.now(),
  };
  log('SEND', `outcome → ${interventionId}: ${status}`);
  ws.send(JSON.stringify(msg));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  log('INIT', `Connecting to ${WS_URL}`);
  log('INIT', `Visitor: ${VISITOR_KEY}, Session: ${SESSION_KEY}`);

  const ws = new WebSocket(`${WS_URL}?channel=widget&sessionId=${SESSION_KEY}`);

  const received = [];
  let interventionReceived = null;

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    received.push(msg);

    if (msg.type === 'intervention') {
      interventionReceived = msg;
      log('🎯 INTERVENTION', JSON.stringify(msg, null, 2));
    } else if (msg.type === 'track_ack') {
      log('RECV', `track_ack ✓ (session: ${msg.sessionId}, event: ${msg.eventId})`);
    } else if (msg.type === 'validation_error') {
      log('❌ ERROR', msg.error);
    } else {
      log('RECV', `${msg.type}: ${JSON.stringify(msg).slice(0, 150)}`);
    }
  });

  ws.on('error', (err) => log('ERROR', err.message));
  ws.on('close', (code) => log('WS', `Closed: ${code}`));

  // Wait for connection
  await new Promise((resolve) => ws.on('open', resolve));
  log('WS', 'Connected ✓');
  await sleep(500);

  // =========================================
  // STEP 1: Initial page view
  // =========================================
  log('STEP', '1. Product page view');
  sendTrack(ws, {
    event_id: `evt_${Date.now()}_1`,
    category: 'navigation',
    event_type: 'page_view',
    raw_signals: { page_type: 'product', scroll_depth: 0 },
    page_context: {
      page_type: 'pdp',
      page_url: 'https://demo-store.example/products/premium-jacket',
      time_on_page_ms: 0,
      scroll_depth_pct: 0,
      viewport: { width: 1440, height: 900 },
      device: 'desktop',
    },
    timestamp: Date.now(),
  });
  await sleep(800);

  // =========================================
  // STEP 2: Browsing behavior
  // =========================================
  log('STEP', '2. Scroll + product view engagement');
  sendTrack(ws, {
    event_id: `evt_${Date.now()}_2`,
    category: 'engagement',
    event_type: 'scroll',
    raw_signals: { scroll_depth: 45, time_on_page_ms: 8000 },
    page_context: {
      page_type: 'pdp',
      page_url: 'https://demo-store.example/products/premium-jacket',
      time_on_page_ms: 8000,
      scroll_depth_pct: 45,
      viewport: { width: 1440, height: 900 },
      device: 'desktop',
    },
    timestamp: Date.now(),
  });
  await sleep(500);

  sendTrack(ws, {
    event_id: `evt_${Date.now()}_3`,
    category: 'product',
    event_type: 'product_view',
    raw_signals: { product_id: 'prod_jacket_001', price: 149.99, time_spent_ms: 15000 },
    page_context: {
      page_type: 'pdp',
      page_url: 'https://demo-store.example/products/premium-jacket',
      time_on_page_ms: 15000,
      scroll_depth_pct: 60,
      viewport: { width: 1440, height: 900 },
      device: 'desktop',
    },
    timestamp: Date.now(),
  });
  await sleep(500);

  // =========================================
  // STEP 3: Friction events
  // =========================================
  log('STEP', '3. Friction: size confusion (F042) + scroll without action (F015)');
  sendTrack(ws, {
    event_id: `evt_${Date.now()}_4`,
    friction_id: 'F042',
    category: 'product',
    event_type: 'size_guide_open',
    raw_signals: { size_guide_opens: 3, time_on_size_guide_ms: 12000 },
    page_context: {
      page_type: 'pdp',
      page_url: 'https://demo-store.example/products/premium-jacket',
      time_on_page_ms: 30000,
      scroll_depth_pct: 75,
      viewport: { width: 1440, height: 900 },
      device: 'desktop',
    },
    timestamp: Date.now(),
  });
  await sleep(500);

  sendTrack(ws, {
    event_id: `evt_${Date.now()}_5`,
    friction_id: 'F015',
    category: 'engagement',
    event_type: 'scroll_without_action',
    raw_signals: { scroll_depth: 90, clicks_after_scroll: 0, time_on_page_ms: 45000 },
    page_context: {
      page_type: 'pdp',
      page_url: 'https://demo-store.example/products/premium-jacket',
      time_on_page_ms: 45000,
      scroll_depth_pct: 90,
      viewport: { width: 1440, height: 900 },
      device: 'desktop',
    },
    timestamp: Date.now(),
  });
  await sleep(500);

  // =========================================
  // STEP 4: Cart behavior
  // =========================================
  log('STEP', '4. Add to cart');
  sendTrack(ws, {
    event_id: `evt_${Date.now()}_6`,
    category: 'cart',
    event_type: 'add_to_cart',
    raw_signals: { product_id: 'prod_jacket_001', price: 149.99, quantity: 1 },
    page_context: {
      page_type: 'cart',
      page_url: 'https://demo-store.example/cart',
      time_on_page_ms: 50000,
      scroll_depth_pct: 0,
      viewport: { width: 1440, height: 900 },
      device: 'desktop',
    },
    timestamp: Date.now(),
  });
  await sleep(500);

  // =========================================
  // STEP 5: Checkout hesitation friction
  // =========================================
  log('STEP', '5. Checkout hesitation (F060) + exit intent (F113)');
  sendTrack(ws, {
    event_id: `evt_${Date.now()}_7`,
    friction_id: 'F060',
    category: 'checkout',
    event_type: 'checkout_hesitation',
    raw_signals: { cart_value: 149.99, time_on_cart_ms: 60000, checkout_started: false },
    page_context: {
      page_type: 'cart',
      page_url: 'https://demo-store.example/cart',
      time_on_page_ms: 60000,
      scroll_depth_pct: 50,
      viewport: { width: 1440, height: 900 },
      device: 'desktop',
    },
    timestamp: Date.now(),
  });
  await sleep(500);

  sendTrack(ws, {
    event_id: `evt_${Date.now()}_8`,
    friction_id: 'F113',
    category: 'checkout',
    event_type: 'exit_intent',
    raw_signals: { mouse_y: -5, cart_value: 149.99, items_in_cart: 1 },
    page_context: {
      page_type: 'cart',
      page_url: 'https://demo-store.example/cart',
      time_on_page_ms: 65000,
      scroll_depth_pct: 50,
      viewport: { width: 1440, height: 900 },
      device: 'desktop',
    },
    timestamp: Date.now(),
  });

  // =========================================
  // STEP 6: Wait for evaluation & intervention
  // =========================================
  log('STEP', '6. Waiting for evaluation batch flush (5s buffer + processing)...');
  await sleep(12000);

  // =========================================
  // RESULTS
  // =========================================
  log('RESULTS', '═'.repeat(60));

  const byType = {};
  for (const msg of received) {
    byType[msg.type] = (byType[msg.type] || 0) + 1;
  }
  log('RESULTS', `Total messages: ${received.length}`);
  log('RESULTS', `By type: ${JSON.stringify(byType)}`);

  if (interventionReceived) {
    log('✅ SUCCESS', 'Intervention received from server!');
    log('INTERVENTION', `Type: ${interventionReceived.payload?.type || interventionReceived.type}`);
    log('INTERVENTION', `Message: ${interventionReceived.payload?.message || interventionReceived.message || 'N/A'}`);
  } else {
    log('INFO', 'No intervention received. Checking via REST API...');
  }

  // =========================================
  // STEP 7: REST API verification
  // =========================================
  log('STEP', '7. Verifying data via REST APIs');

  // Get sessions
  const sessRes = await fetch('http://localhost:8080/api/sessions');
  const sessions = await sessRes.json();
  const sessionList = Array.isArray(sessions) ? sessions : sessions.sessions || [];
  log('API', `Sessions in DB: ${sessionList.length}`);

  // Find our session
  const ourSession = sessionList.find(s =>
    s.visitorId === 'vis_test_001' || s.siteUrl === SITE_URL
  );

  if (ourSession) {
    log('API', `Our session: id=${ourSession.id}, interventions=${ourSession.totalInterventionsFired}, dismissals=${ourSession.totalDismissals}`);

    // Get events for our session
    const evtRes = await fetch(`http://localhost:8080/api/sessions/${ourSession.id}/events`);
    const events = await evtRes.json();
    const eventList = Array.isArray(events) ? events : events.events || [];
    log('API', `Events recorded: ${eventList.length}`);

    if (eventList.length > 0) {
      for (const e of eventList.slice(0, 3)) {
        log('API', `  → ${e.category}/${e.eventType} friction=${e.frictionId || 'none'}`);
      }
      if (eventList.length > 3) {
        log('API', `  ... and ${eventList.length - 3} more`);
      }
    }
  }

  // Check analytics
  const analyticsRes = await fetch(`http://localhost:8080/api/analytics/overview?siteUrl=${encodeURIComponent(SITE_URL)}`);
  if (analyticsRes.ok) {
    const analytics = await analyticsRes.json();
    log('API', `Analytics: ${JSON.stringify(analytics).slice(0, 300)}`);
  }

  // =========================================
  // STEP 8: Send outcome if intervention received
  // =========================================
  if (interventionReceived) {
    const iid = interventionReceived.payload?.intervention_id || interventionReceived.intervention_id;
    if (iid) {
      log('STEP', '8. Sending dismiss outcome');
      sendOutcome(ws, iid, 'dismissed');
      await sleep(2000);
    }
  }

  // =========================================
  // STEP 9: Check training data
  // =========================================
  const trainRes = await fetch('http://localhost:8080/api/training/stats');
  if (trainRes.ok) {
    const trainStats = await trainRes.json();
    log('TRAINING', `Stats: ${JSON.stringify(trainStats).slice(0, 300)}`);
  }

  ws.close();

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('  AVA E2E PIPELINE TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  Visitor Key:    ${VISITOR_KEY}`);
  console.log(`  Site URL:       ${SITE_URL}`);
  console.log(`  Events sent:    8`);
  console.log(`  Messages recv:  ${received.length}`);
  console.log(`  Acks received:  ${byType.track_ack || 0}`);
  console.log(`  Errors:         ${byType.validation_error || 0}`);
  console.log(`  Intervention:   ${interventionReceived ? 'YES ✓' : 'NO'}`);
  console.log('═'.repeat(60));

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
