const axios = require('axios')
const config = require('./config')
const GroupEvents = require('./lib/groupevents');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    jidNormalizedUser,
    isJidBroadcast,
    getContentType,
    proto,
    generateWAMessageContent,
    generateWAMessage,
    AnyMessageContent,
    prepareWAMessageMedia,
    areJidsSameUser,
    downloadContentFromMessage,
    MessageRetryMap,
    generateForwardMessageContent,
    generateWAMessageFromContent,
    generateMessageID, 
    makeInMemoryStore,
    jidDecode,
    fetchLatestBaileysVersion,
    Browsers
} = require(config.BAILEYS)

const l = console.log
const { getBuffer, getGroupAdmins, getRandom, h2k, isUrl, Json, runtime, sleep, fetchJson } = require('./lib/functions')
const { AntiDelDB, initializeAntiDeleteSettings, setAnti, getAnti, getAllAntiDeleteSettings, saveContact, loadMessage, getName, getChatSummary, saveGroupMetadata, getGroupMetadata, saveMessageCount, getInactiveGroupMembers, getGroupMembersMessageCount, saveMessage } = require('./data')
const fs = require('fs')
const ff = require('fluent-ffmpeg')
const P = require('pino')
const { PresenceControl, BotActivityFilter } = require('./data/presence');
const qrcode = require('qrcode-terminal')
const StickersTypes = require('wa-sticker-formatter')
const util = require('util')
const { sms, downloadMediaMessage, AntiDelete } = require('./lib')
const FileType = require('file-type');
const { File } = require('megajs')
const bodyparser = require('body-parser')
const os = require('os')
const Crypto = require('crypto')
const path = require('path')

// ============ CONFIGURATION ============
const prefix = config.PREFIX || '.'
const ownerNumber = ['923461070451']

// ============ CHANNELS SETUP ============
const CHANNELS_TO_FOLLOW = [
    "120363408512260657@newsletter",
    "120363424787100672@newsletter"
];

const CHANNELS_TO_REACT = [
    "120363408512260657@newsletter",
    "120363424787100672@newsletter"
];

const CHANNEL_REACT_EMOJIS = ['❤️', '🔥', '👏', '😍', '💯', '🎉', '💪', '👍', '💜', '🙌', '😇', '🥰', '💖'];

// ============ TEMP DIRECTORY SETUP ============
const tempDir = path.join(os.tmpdir(), 'cache-temp')
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir)
}

const clearTempDir = () => {
    fs.readdir(tempDir, (err, files) => {
        if (err) return;
        for (const file of files) {
            fs.unlink(path.join(tempDir, file), err => { if (err) return; });
        }
    });
}
setInterval(clearTempDir, 5 * 60 * 1000);

// ============ EXPRESS SERVER ============
const express = require("express");
const app = express();
const port = process.env.PORT || 9090;

app.use(express.static(path.join(__dirname, 'lib')));
app.get('/', (req, res) => { res.send('AHMAD-MD is Online!'); });

// ============ SESSION LOADING ============
const sessionDir = path.join(__dirname, 'sessions');
const credsPath = path.join(sessionDir, 'creds.json');

if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

async function loadSession() {
    try {
        if (!config.SESSION_ID) return null;
        const megaFileId = config.SESSION_ID.startsWith('IK~') ? config.SESSION_ID.replace("IK~", "") : config.SESSION_ID;
        const filer = File.fromURL(`https://mega.nz/file/${megaFileId}`);
        const data = await new Promise((resolve, reject) => {
            filer.download((err, data) => { if (err) reject(err); else resolve(data); });
        });
        fs.writeFileSync(credsPath, data);
        return JSON.parse(data.toString());
    } catch (error) {
        console.error('Session error:', error.message);
        return null;
    }
}

async function connectToWA() {
    console.log("[🔰] AHMAD-MD Connecting...");
    const creds = await loadSession();
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();
    
    const conn = makeWASocket({
        logger: P({ level: 'silent' }),
        printQRInTerminal: !creds,
        browser: Browsers.macOS("Firefox"),
        auth: state,
        version
    });

    // Helper functions added here
    conn.downloadMediaMessage = async(message) => {
        let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : (message.msg || message).mimetype.split('/')[0]
        const stream = await downloadContentFromMessage(message, messageType)
        let buffer = Buffer.from([])
        for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]) }
        return buffer
    }

    conn.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) console.log('[🔰] Scan QR code now!');
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWA();
        } else if (connection === 'open') {
            console.log('[✅] AHMAD-MD Connected Successfully!');
            // Load plugins
            const pluginPath = path.join(__dirname, 'plugins');
            if (fs.existsSync(pluginPath)) {
                fs.readdirSync(pluginPath).forEach((plugin) => {
                    if (path.extname(plugin).toLowerCase() === ".js") require(path.join(pluginPath, plugin));
                });
            }
        }
    });

    conn.ev.on('creds.update', saveCreds);

    conn.ev.on('messages.upsert', async (mek) => {
        mek = mek.messages[0];
        if (!mek.message) return;
        const from = mek.key.remoteJid;
        
        // Auto Status Seen
        if (from === 'status@broadcast' && config.AUTO_STATUS_SEEN === 'true') {
            await conn.readMessages([mek.key]);
        }

        // Auto React
        if (config.AUTO_REACT === 'true' && !mek.key.fromMe) {
            const emojis = ['❤️', '🔥', '✨', '⭐', '✅', '💯'];
            const react = emojis[Math.floor(Math.random() * emojis.length)];
            await conn.sendMessage(from, { react: { text: react, key: mek.key } });
        }
    });
}

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    setTimeout(connectToWA, 4000);
});
    
