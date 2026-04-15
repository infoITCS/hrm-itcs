/**
 * relay-punches.js
 * Run this on the local PC that receives data from the ZKTeco machine.
 * It forwards machine heartbeats and punch logs to the live HRM backend.
 *
 * Usage:
 *   node relay-punches.js
 *
 * Optional env vars:
 *   RELAY_PORT=8080
 *   HRM_SERVER=https://hrm-itcs-server.vercel.app
 */

const express = require('express');

const app = express();

const RELAY_PORT = parseInt(process.env.RELAY_PORT || '8080', 10);
const HRM_SERVER = (process.env.HRM_SERVER || 'https://hrm-itcs-server.vercel.app').replace(/\/$/, '');

app.use(express.text({ type: '*/*' }));

// Receive heartbeat from machine and forward to HRM.
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
        res.set('Content-Type', 'text/plain');
        res.send(`GET OPTION FROM: ${SN}\nATTLOGStamp=9999\nDelay=10\nRealtime=1\nEncrypt=0\n`);
    }
});

// Receive punch data from machine and forward to HRM.
app.post('/iclock/cdata', async (req, res) => {
    const SN = req.query.SN || 'UNKNOWN';
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

// Machine polls for commands.
app.get('/iclock/getrequest', (_req, res) => {
    res.set('Content-Type', 'text/plain').send('OK\n');
});

app.post('/iclock/devicecmd', (_req, res) => {
    res.set('Content-Type', 'text/plain').send('OK\n');
});

app.listen(RELAY_PORT, '0.0.0.0', () => {
    console.log(`\nRelay running on port ${RELAY_PORT}`);
    console.log(`Forwarding punches to HRM at: ${HRM_SERVER}`);
    console.log(`\nConfigure ZKTeco machine Cloud Server to:`);
    console.log(`Server: <PC-A-IP>   Port: ${RELAY_PORT}`);
    console.log(`Forward target: ${HRM_SERVER}\n`);
});
