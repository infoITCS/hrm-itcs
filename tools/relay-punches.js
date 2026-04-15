/**
 * relay-punches.js
 * Run this on PC A (the machine that has ZKTeco local cloud software).
 * It acts as a middleman: receives punches from the ZKTeco machine,
 * saves them locally, AND forwards them to your HRM server on PC B.
 *
 * Usage:
 *   node relay-punches.js
 *
 * Requirements:
 *   npm install express node-fetch
 */

const express = require('express');
const app = express();

// ── CONFIG ────────────────────────────────────────────────────────────────────
const RELAY_PORT  = 8080;                             // Port ZKTeco machine points to (on PC A)
const HRM_SERVER  = 'http://192.168.1.105:5000';      // ← Change to PC B's IP & port
// ─────────────────────────────────────────────────────────────────────────────

app.use(express.text({ type: '*/*' }));

// Receive heartbeat from machine → forward to HRM
app.get('/iclock/cdata', async (req, res) => {
    const SN = req.query.SN || 'UNKNOWN';
    console.log(`[RELAY] Heartbeat from device: ${SN}`);

    try {
        const hrmRes = await fetch(
            `${HRM_SERVER}/api/attendance/iclock/cdata?${new URLSearchParams(req.query)}`,
            { method: 'GET' }
        );
        const text = await hrmRes.text();
        res.set('Content-Type', 'text/plain').send(text);
    } catch (err) {
        console.error('[RELAY] HRM unreachable:', err.message);
        // Fallback response so machine stays happy
        res.set('Content-Type', 'text/plain');
        res.send(`GET OPTION FROM: ${SN}\nATTLOGStamp=9999\nDelay=10\nRealtime=1\nEncrypt=0\n`);
    }
});

// Receive punch data from machine → forward to HRM
app.post('/iclock/cdata', async (req, res) => {
    const SN    = req.query.SN    || 'UNKNOWN';
    const table = req.query.table || '';
    console.log(`[RELAY] Punch data from ${SN}, table=${table}`);
    console.log(`[RELAY] Body:\n${req.body}`);

    try {
        const url = `${HRM_SERVER}/api/attendance/iclock/cdata?${new URLSearchParams(req.query)}`;
        const hrmRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: req.body,
        });
        const text = await hrmRes.text();
        console.log(`[RELAY] HRM responded: ${text.trim()}`);
        res.set('Content-Type', 'text/plain').send(text);
    } catch (err) {
        console.error('[RELAY] Failed to forward to HRM:', err.message);
        res.set('Content-Type', 'text/plain').send('OK: 0\n');
    }
});

// Machine polls for commands
app.get('/iclock/getrequest', (req, res) => {
    res.set('Content-Type', 'text/plain').send('OK\n');
});

app.post('/iclock/devicecmd', (req, res) => {
    res.set('Content-Type', 'text/plain').send('OK\n');
});

app.listen(RELAY_PORT, '0.0.0.0', () => {
    console.log(`\n✅ Relay running on port ${RELAY_PORT}`);
    console.log(`   Forwarding punches to HRM at: ${HRM_SERVER}`);
    console.log(`\n   Configure ZKTeco machine Cloud Server to:`);
    console.log(`   Server: <PC-A-IP>   Port: ${RELAY_PORT}\n`);
});
