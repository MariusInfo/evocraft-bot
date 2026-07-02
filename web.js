const express = require('express');
const session = require('express-session'); 
const fs = require('fs'); 
const path = require('path');
const { ChannelType, PermissionsBitField } = require('discord.js');
const { db, saveDatabase } = require('./database');
const { updateMCStatus } = require('./utils');

function startWebPanel(client, TRANSCRIPTS_DIR) {
    const app = express();
    const PORT = 3000;

    app.use(express.urlencoded({ extended: true }));
    app.use(express.json()); 

    // Session Configuration
    app.use(session({
        secret: 'evocraft-secret-key-super-secure',
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 24 * 60 * 60 * 1000 } 
    }));

    // LOGIN PAGE ROUTE (Discord OAuth2)
    app.get('/login', (req, res) => {
        let errorMsg = '';
        if (req.query.error === '1') errorMsg = '<p style="color:var(--danger); font-weight:bold; font-size:14px; margin-bottom: 15px;">An error occurred while authenticating with Discord!</p>';
        if (req.query.error === '2') errorMsg = '<p style="color:var(--danger); font-weight:bold; font-size:14px; margin-bottom: 15px;">Access denied! You do not have the required permission to access the panel.</p>';

        const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify`;

        res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Authentication - EvoBot Panel</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
            <style>
                :root { --bg-main: #0B0D11; --card-bg: rgba(20, 23, 28, 0.85); --accent: #00d0ff; --danger: #ff4757; }
                body { background-color: var(--bg-main); background-image: radial-gradient(circle at 50% -20%, #15263a, transparent 50%); color: white; font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .login-box { background: var(--card-bg); backdrop-filter: blur(20px); padding: 50px 40px; border-radius: 20px; box-shadow: 0 15px 35px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.05); text-align: center; border-top: 4px solid var(--accent); width: 100%; max-width: 380px; position: relative; overflow: hidden;}
                .login-box::before { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 4px; background: linear-gradient(90deg, transparent, #00d0ff, transparent); animation: scanline 3s linear infinite; }
                @keyframes scanline { 100% { left: 100%; } }
                .logo { font-size: 32px; font-weight: 800; color: white; letter-spacing: 3px; margin-bottom: 10px;}
                .logo span { color: var(--accent); }
                .subtitle { color: #8A939F; font-size: 14px; margin-bottom: 30px; }
                .btn-discord-login { display: flex; align-items: center; justify-content: center; gap: 10px; background: linear-gradient(135deg, #5865F2, #4752C4); color: white; padding: 16px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 8px 20px rgba(88, 101, 242, 0.3); text-transform: uppercase; letter-spacing: 1px;}
                .btn-discord-login:hover { transform: translateY(-3px); box-shadow: 0 12px 25px rgba(88, 101, 242, 0.5); filter: brightness(1.1); }
            </style>
        </head>
        <body>
            <div class="login-box">
                <div class="logo">EVO<span>BOT</span></div>
                <div class="subtitle">EvoCraft Server Management</div>
                ${errorMsg}
                <a href="${discordAuthUrl}" class="btn-discord-login">
                    <svg width="24" height="24" viewBox="0 0 127.14 96.36" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83A97.68 97.68 0 0 0 49 6.83a72.37 72.37 0 0 0-3.4-6.83A105.73 105.73 0 0 0 19.43 8.07C2.79 32.65-1.7 56.6.5 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.1 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a67.73 67.73 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-19.32-72.14zM42.56 65.3c-5.36 0-9.8-4.95-9.8-11s4.33-11 9.8-11c5.5 0 9.84 4.95 9.8 11s-4.38 11-9.8 11zm42.06 0c-5.36 0-9.8-4.95-9.8-11s4.33-11 9.8-11c5.5 0 9.84 4.95 9.8 11s-4.38 11-9.8 11z"/></svg>
                    Login
                </a>
            </div>
        </body>
        </html>
        `);
    });

    // DISCORD CALLBACK ROUTE
    app.get('/auth/discord/callback', async (req, res) => {
        const code = req.query.code;
        if (!code) return res.redirect('/login?error=1');

        try {
            const tokenParams = new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: process.env.REDIRECT_URI
            });

            const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
                method: 'POST',
                body: tokenParams,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            
            const tokenData = await tokenRes.json();
            if (!tokenData.access_token) return res.redirect('/login?error=1');

            const userRes = await fetch('https://discord.com/api/users/@me', {
                headers: { authorization: `Bearer ${tokenData.access_token}` }
            });
            const userData = await userRes.json();

            let isAdmin = false;
            let isHelper = false;

            for (const guild of client.guilds.cache.values()) {
                try {
                    const member = await guild.members.fetch(userData.id);
                    if (member) {
                        if (member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                            isAdmin = true;
                        }
                        if (db.serverConfig.staffRole && member.roles.cache.has(db.serverConfig.staffRole)) {
                            isHelper = true;
                        }
                    }
                } catch (err) {
                }
            }

            if (isAdmin || isHelper) {
                req.session.loggedIn = true;
                req.session.userId = userData.id;
                req.session.username = userData.username;
                req.session.avatar = `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`;
                req.session.isAdmin = isAdmin; // Save in session if full admin or just helper
                res.redirect('/');
            } else {
                res.redirect('/login?error=2');
            }

        } catch (err) {
            console.error('Error during Discord OAuth2 authentication:', err);
            res.redirect('/login?error=1');
        }
    });

    // LOGOUT ROUTE
    app.get('/logout', (req, res) => {
        req.session.destroy();
        res.redirect('/login');
    });

    // MIDDLEWARE TO PROTECT OTHER ROUTES
    const authMiddleware = (req, res, next) => {
        if (req.session && req.session.loggedIn) {
            return next();
        }
        res.redirect('/login');
    };

    app.use(authMiddleware);

    // --- WEB PANEL ROUTES ---
    app.get('/', async (req, res) => {
        
        const isUserAdmin = req.session.isAdmin;
        const disabledAttr = isUserAdmin ? '' : 'disabled';
        const displaySaveBtn = isUserAdmin ? '' : 'display: none;';
        const displayRoleName = isUserAdmin ? 'Administrator' : 'Staff (View Only)';

        // ---- FETCH DATA FROM PYTHON API ----
        try {
            const response = await fetch('http://127.0.0.1:5011/get-all-players', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ auth_key: 'EVOCRAFTSECURITYPASSWORD2026' }),
                signal: AbortSignal.timeout(3000)
            });
            const data = await response.json();
            
            if (data.status === 'SUCCESS') {
                db.players = data.players; 
            } else {
                db.players = [];
            }
        } catch (err) {
            console.error('Error fetching SQL database for players (Timeout or API offline):', err.message);
            db.players = [];
        }
        // ---- END FETCH DATA ----

        let welcomeOptions = '<option value="">-- Select a Channel --</option>';
        let staffOptions = '<option value="">-- Select a Channel --</option>';
        let transcriptsOptions = '<option value="">-- Select a Channel --</option>';
        let mcStatusOptions = '<option value="">-- Select a Channel --</option>';
        let logsOptions = '<option value="">-- Select a Channel --</option>';
        let modLogsOptions = '<option value="">-- Select a Channel --</option>';
        let categoryOptions = '<option value="">-- Select a Category --</option>';
        let unbanCategoryOptions = '<option value="">-- Select a Category --</option>';
        let roleOptions = '<option value="">-- No Auto-Role --</option>';
        let staffRoleOptions = '<option value="">-- No Staff Role --</option>'; 
        let verifiedRoleOptions = '<option value="">-- No Verified Role --</option>'; 
        let softBanRoleOptions = '<option value="">-- No Soft-Ban Role --</option>';

        client.guilds.cache.forEach(guild => {
            const optGroupStart = `<optgroup label="🌐 Server: ${guild.name}">`;
            const optGroupEnd = `</optgroup>`;

            welcomeOptions += optGroupStart;
            staffOptions += optGroupStart;
            transcriptsOptions += optGroupStart;
            mcStatusOptions += optGroupStart;
            logsOptions += optGroupStart;
            modLogsOptions += optGroupStart;

            guild.channels.cache.filter(c => c.type === ChannelType.GuildText).forEach(c => {
                let selWelcome = db.serverConfig.welcomeChannel === c.id ? 'selected' : '';
                let selStaff = db.serverConfig.staffChannel === c.id ? 'selected' : '';
                let selTranscripts = db.serverConfig.transcriptsChannel === c.id ? 'selected' : '';
                let selStatus = db.serverConfig.mcStatusChannel === c.id ? 'selected' : '';
                let selLogs = db.serverConfig.logsChannel === c.id ? 'selected' : '';
                let selModLogs = db.serverConfig.modLogsChannel === c.id ? 'selected' : '';
                
                welcomeOptions += `<option value="${c.id}" ${selWelcome}>#${c.name}</option>`;
                staffOptions += `<option value="${c.id}" ${selStaff}>#${c.name}</option>`;
                transcriptsOptions += `<option value="${c.id}" ${selTranscripts}>#${c.name}</option>`;
                mcStatusOptions += `<option value="${c.id}" ${selStatus}>#${c.name}</option>`;
                logsOptions += `<option value="${c.id}" ${selLogs}>#${c.name}</option>`;
                modLogsOptions += `<option value="${c.id}" ${selModLogs}>#${c.name}</option>`;
            });

            welcomeOptions += optGroupEnd;
            staffOptions += optGroupEnd;
            transcriptsOptions += optGroupEnd;
            mcStatusOptions += optGroupEnd;
            logsOptions += optGroupEnd;
            modLogsOptions += optGroupEnd;

            categoryOptions += optGroupStart;
            unbanCategoryOptions += optGroupStart;
            guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).forEach(c => {
                let selCat = db.serverConfig.ticketCategory === c.id ? 'selected' : '';
                categoryOptions += `<option value="${c.id}" ${selCat}>📁 ${c.name}</option>`;
                
                let selUnbanCat = db.serverConfig.unbanCategory === c.id ? 'selected' : '';
                unbanCategoryOptions += `<option value="${c.id}" ${selUnbanCat}>📁 ${c.name}</option>`;
            });
            categoryOptions += optGroupEnd;
            unbanCategoryOptions += optGroupEnd;

            roleOptions += optGroupStart;
            staffRoleOptions += optGroupStart; 
            verifiedRoleOptions += optGroupStart;
            softBanRoleOptions += optGroupStart;

            guild.roles.cache.filter(r => r.name !== '@everyone').forEach(r => {
                let selAutoRole = db.serverConfig.autoRole === r.id ? 'selected' : '';
                let selStaffRole = db.serverConfig.staffRole === r.id ? 'selected' : ''; 
                let selVerifiedRole = db.serverConfig.verifiedRole === r.id ? 'selected' : '';
                let selSoftBanRole = db.serverConfig.softBanRole === r.id ? 'selected' : '';

                roleOptions += `<option value="${r.id}" ${selAutoRole}>@${r.name}</option>`;
                staffRoleOptions += `<option value="${r.id}" ${selStaffRole}>@${r.name}</option>`; 
                verifiedRoleOptions += `<option value="${r.id}" ${selVerifiedRole}>@${r.name}</option>`;
                softBanRoleOptions += `<option value="${r.id}" ${selSoftBanRole}>@${r.name}</option>`;
            });
            roleOptions += optGroupEnd;
            staffRoleOptions += optGroupEnd; 
            verifiedRoleOptions += optGroupEnd;
            softBanRoleOptions += optGroupEnd;
        });

        let htmlRoles = '';
        for(let i=0; i<3; i++) {
            let r = db.roluri[i] || { nume: '', emoji: '', id: '' };
            htmlRoles += `
                <div class="form-row">
                    <div class="input-group" style="flex:1;"><label>Emoji</label><input type="text" name="r${i}_emoji" value="${r.emoji}" placeholder="🎮" ${disabledAttr}></div>
                    <div class="input-group" style="flex:2;"><label>Role Name</label><input type="text" name="r${i}_nume" value="${r.nume}" placeholder="Ex: Adventurer" ${disabledAttr}></div>
                    <div class="input-group" style="flex:2;"><label>Discord Role ID</label><input type="text" name="r${i}_id" value="${r.id}" placeholder="Ex: 123456789" ${disabledAttr}></div>
                </div>`;
        }

        let htmlForm1 = `<div id="q_list_f1">`;
        if (db.formulare.form1.questions) {
            db.formulare.form1.questions.forEach((q, i) => {
                htmlForm1 += `
                    <div class="form-group border-accent" style="position:relative;">
                        <label>Question ${i + 1}</label>
                        <input type="text" name="f1_q[]" value="${q}" ${disabledAttr}>
                        <button type="button" onclick="this.parentElement.remove()" style="position:absolute; right:20px; top:15px; background:var(--danger); border:none; padding:5px 10px; color:white; border-radius:5px; cursor:pointer; ${displaySaveBtn}">Delete</button>
                    </div>`;
            });
        }
        htmlForm1 += `</div>
        <button type="button" onclick="addQuestion('f1', 'accent')" style="background:#5865F2; border:none; color:white; padding:10px; border-radius:8px; cursor:pointer; margin-bottom:20px; font-weight:bold; ${displaySaveBtn}">➕ Add Question</button>`;

        let htmlForm2 = `<div id="q_list_f2">`;
        if (db.formulare.form2.questions) {
            db.formulare.form2.questions.forEach((q, i) => {
                htmlForm2 += `
                    <div class="form-group border-danger" style="position:relative;">
                        <label>Question ${i + 1}</label>
                        <input type="text" name="f2_q[]" value="${q}" ${disabledAttr}>
                        <button type="button" onclick="this.parentElement.remove()" style="position:absolute; right:20px; top:15px; background:var(--danger); border:none; padding:5px 10px; color:white; border-radius:5px; cursor:pointer; ${displaySaveBtn}">Delete</button>
                    </div>`;
            });
        }
        htmlForm2 += `</div>
        <button type="button" onclick="addQuestion('f2', 'danger')" style="background:#5865F2; border:none; color:white; padding:10px; border-radius:8px; cursor:pointer; margin-bottom:20px; font-weight:bold; ${displaySaveBtn}">➕ Add Question</button>`;

        let htmlTranscripts = '';
        if (fs.existsSync(TRANSCRIPTS_DIR)) {
            const files = fs.readdirSync(TRANSCRIPTS_DIR).filter(file => file.endsWith('.html')).reverse();
            for (let file of files) {
                let tId = file.replace('.html', '');
                htmlTranscripts += `<a href="/transcript/${tId}" target="_blank" class="transcript-item">📄 ${tId} <span class="view-btn">View Chat</span></a>`;
            }
        }

        if (htmlTranscripts === '') htmlTranscripts = '<p class="text-muted">No closed tickets at the moment.</p>';

        let htmlPenalizari = '';
        if (db.penalizari && db.penalizari.length > 0) {
            db.penalizari.slice(0, 50).forEach(p => {
                let badgeClass = 'badge-warning'; 
                if (p.type === 'TIMEOUT') badgeClass = 'badge-orange';
                if (p.type.includes('BAN')) badgeClass = 'badge-danger';
                
                htmlPenalizari += `<div class="log-item ${badgeClass}">
                    <div class="log-header">
                        <span class="log-type">${p.type}</span>
                        <span class="log-date">${p.date}</span>
                    </div>
                    <div class="log-body">
                        Applied to <b class="target">${p.target}</b> by <b class="staff">${p.staff}</b><br>
                        <span class="log-reason">Reason: ${p.reason}</span>
                    </div>
                </div>`;
            });
        } else {
            htmlPenalizari = '<p class="text-muted">No penalties recorded on the server.</p>';
        }

        let htmlActiveTickets = '';
        if (db.serverConfig.ticketCategory) {
            client.guilds.cache.forEach(guild => {
                const tickets = guild.channels.cache.filter(c => c.parentId === db.serverConfig.ticketCategory && c.type === ChannelType.GuildText);
                tickets.forEach(t => {
                    htmlActiveTickets += `<div class="active-ticket-item">
                        <div class="ticket-icon">🟢</div>
                        <div class="ticket-info">
                            <b>#${t.name}</b>
                            <span>Created at: ${t.createdAt.toLocaleString('en-US')}</span>
                        </div>
                    </div>`;
                });
            });
        }
        if (htmlActiveTickets === '') htmlActiveTickets = '<p class="text-muted">No active tickets at the moment.</p>';

        let htmlJucatori = '';
        if (db.players && db.players.length > 0) {
            const groupedPlayers = {};
            db.players.forEach(p => {
                const hwid = p.hwid || 'No_HWID';
                if (!groupedPlayers[hwid]) groupedPlayers[hwid] = [];
                groupedPlayers[hwid].push(p);
            });

            const sortedHwids = Object.keys(groupedPlayers).sort((a, b) => groupedPlayers[b].length - groupedPlayers[a].length);

            sortedHwids.forEach(hwid => {
                const accounts = groupedPlayers[hwid];
                const count = accounts.length;
                let badge = count > 1 ? `<span style="background:var(--danger);color:white;padding:3px 8px;border-radius:4px;font-size:12px;font-weight:bold;">${count} Accounts! (Alts)</span>` : `<span style="color:var(--text-muted);font-size:12px;">1 Account</span>`;
                let borderClass = count > 1 ? 'border-left: 4px solid var(--danger);' : 'border-left: 4px solid var(--accent);';

                htmlJucatori += `<div style="background:rgba(0,0,0,0.3); border-radius:8px; margin-bottom:20px; overflow:hidden; ${borderClass}">
                    <div style="padding:15px 20px; background:rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center; font-weight:bold; font-size:14px;">
                        <span>💻 HWID: <span style="color:var(--accent);">${hwid}</span></span>
                        ${badge}
                    </div>
                    <table style="width:100%; border-collapse:collapse;">
                        <thead>
                            <tr>
                                <th style="padding:12px 20px; text-align:left; border-bottom:1px solid rgba(255,255,255,0.05); color:var(--text-muted); font-size:12px; text-transform:uppercase;">Player Name</th>
                                <th style="padding:12px 20px; text-align:left; border-bottom:1px solid rgba(255,255,255,0.05); color:var(--text-muted); font-size:12px; text-transform:uppercase;">Premium</th>
                                <th style="padding:12px 20px; text-align:left; border-bottom:1px solid rgba(255,255,255,0.05); color:var(--text-muted); font-size:12px; text-transform:uppercase;">Discord ID</th>
                            </tr>
                        </thead>
                        <tbody>`;

                accounts.forEach(acc => {
                    let isPrem = (acc.is_premium == 1 || acc.is_premium === true || String(acc.is_premium) === '1') ? '<span style="color:var(--success);font-weight:bold;">YES</span>' : '<span style="color:var(--danger);font-weight:bold;">NO</span>';
                    let discord = acc.discord_user && acc.discord_user !== '(NULL)' && acc.discord_user !== 'NULL' ? acc.discord_user : '<span class="text-muted">Not connected</span>';
                    htmlJucatori += `
                            <tr>
                                <td style="padding:12px 20px; text-align:left; border-bottom:1px solid rgba(255,255,255,0.05); font-size:14px;"><b>${acc.username}</b></td>
                                <td style="padding:12px 20px; text-align:left; border-bottom:1px solid rgba(255,255,255,0.05); font-size:14px;">${isPrem}</td>
                                <td style="padding:12px 20px; text-align:left; border-bottom:1px solid rgba(255,255,255,0.05); font-size:14px;">${discord}</td>
                            </tr>`;
                });

                htmlJucatori += `</tbody></table></div>`;
            });
        } else {
            htmlJucatori = '<p class="text-muted">No player data exists! Make sure you fetch data from the SQL database and assign it to <code>db.players</code> to appear here.</p>';
        }

        const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>EvoBot - Control Panel</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
            <style>
                :root { 
                    --bg-dark: #07090c; 
                    --sidebar-bg: #0d1117;
                    --card-bg: rgba(22, 27, 34, 0.7); 
                    --accent: #00d0ff; 
                    --accent-hover: #00a4cc;
                    --discord: #5865F2; 
                    --danger: #ff4757;
                    --warning: #f1c40f;
                    --success: #2ecc71;
                    --text-main: #e6edf3;
                    --text-muted: #8b949e;
                    --border-color: rgba(255,255,255,0.06);
                }
                * { box-sizing: border-box; }
                body { background-color: var(--bg-dark); color: var(--text-main); font-family: 'Inter', sans-serif; margin: 0; padding: 0; display: flex; height: 100vh; overflow: hidden; }
                
                /* SCROLLBAR MODERNA */
                ::-webkit-scrollbar { width: 8px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
                ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

                /* SIDEBAR */
                .sidebar { width: 280px; background-color: var(--sidebar-bg); border-right: 1px solid var(--border-color); display: flex; flex-direction: column; z-index: 10; box-shadow: 4px 0 20px rgba(0,0,0,0.4);}
                .sidebar-header { padding: 30px 20px; text-align: center; border-bottom: 1px solid var(--border-color); }
                .logo { font-size: 26px; font-weight: 800; color: white; letter-spacing: 2px; text-shadow: 0 0 10px rgba(0, 208, 255, 0.3);}
                .logo span { color: var(--accent); }
                
                .nav-menu { padding: 20px 0; flex: 1; overflow-y: auto;}
                .nav-item { display: block; padding: 16px 30px; color: var(--text-muted); text-decoration: none; font-weight: 600; font-size: 14px; transition: all 0.3s; border-left: 3px solid transparent; cursor: pointer; text-transform: uppercase; letter-spacing: 1px;}
                .nav-item:hover { color: white; background: rgba(255,255,255,0.03); }
                .nav-item.active { color: var(--accent); border-left: 3px solid var(--accent); background: linear-gradient(90deg, rgba(0, 208, 255, 0.1) 0%, transparent 100%); }
                .nav-item i { margin-right: 12px; font-size: 18px; vertical-align: middle; }

                .sidebar-footer { padding: 20px; border-top: 1px solid var(--border-color); display: flex; align-items: center; gap: 15px;}
                .user-avatar { width: 40px; height: 40px; border-radius: 50%; border: 2px solid var(--accent); object-fit: cover;}
                .user-info { flex: 1; overflow: hidden; }
                .user-name { font-weight: 600; font-size: 14px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
                .user-role { font-size: 12px; color: var(--accent); }
                .logout-btn { background: rgba(255, 71, 87, 0.1); color: var(--danger); padding: 8px; border-radius: 8px; text-decoration: none; transition: 0.3s; display: flex; align-items: center; justify-content: center;}
                .logout-btn:hover { background: var(--danger); color: white; }

                /* MAIN CONTENT */
                .main-content { flex: 1; overflow-y: auto; padding: 40px 50px; background-image: radial-gradient(circle at top right, rgba(0,208,255,0.05), transparent 40%); }
                .page-header { margin-bottom: 40px; }
                .page-title { font-size: 32px; font-weight: 800; margin: 0 0 10px 0; }
                .page-desc { color: var(--text-muted); font-size: 15px; margin: 0; }

                /* TAB SYSTEM */
                .tab-content { display: none; animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
                .tab-content.active { display: block; }
                @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

                /* CARDS & GRID */
                .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 30px; margin-bottom: 30px; }
                .card { background: var(--card-bg); backdrop-filter: blur(12px); border: 1px solid var(--border-color); border-radius: 16px; padding: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); transition: transform 0.3s, box-shadow 0.3s; }
                .card:hover { border-color: rgba(0, 208, 255, 0.2); box-shadow: 0 15px 40px rgba(0, 208, 255, 0.05); }
                .card-title { font-size: 18px; font-weight: 700; margin-top: 0; margin-bottom: 25px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 15px; text-transform: uppercase; letter-spacing: 1px;}
                .card-title span { color: var(--accent); }

                /* FORMS */
                .form-group { margin-bottom: 20px; background: rgba(0,0,0,0.2); padding: 20px; border-radius: 12px; border-left: 3px solid var(--border-color); transition: 0.3s; }
                .form-group:focus-within { border-left-color: var(--accent); background: rgba(0, 208, 255, 0.02); }
                .form-group.border-accent { border-left-color: var(--discord); }
                .form-group.border-danger { border-left-color: var(--danger); }
                .form-group.border-warning { border-left-color: var(--warning); }
                .form-group.border-success { border-left-color: var(--success); }
                
                .form-row { display: flex; gap: 15px; margin-bottom: 20px; background: rgba(0,0,0,0.2); padding: 20px; border-radius: 12px;}
                .input-group { display: flex; flex-direction: column; gap: 8px;}

                label { font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; }
                input[type="text"], select { width: 100%; padding: 14px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: white; font-family: 'Inter', sans-serif; font-size: 14px; transition: 0.3s; outline: none; }
                input[type="text"]:focus, select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(0, 208, 255, 0.1); }
                input:disabled, select:disabled { opacity: 0.6; cursor: not-allowed; background: rgba(0,0,0,0.5); }
                optgroup { background: #161b22; color: var(--accent); }
                option { background: #0d1117; color: white; }

                /* BUTTONS */
                .btn-primary { background: linear-gradient(135deg, var(--accent), var(--accent-hover)); color: #000; padding: 16px 30px; border: none; border-radius: 8px; font-weight: 800; font-size: 14px; cursor: pointer; transition: 0.3s; text-transform: uppercase; letter-spacing: 1.5px; width: 100%; box-shadow: 0 8px 20px rgba(0, 208, 255, 0.2); }
                .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 12px 25px rgba(0, 208, 255, 0.4); }
                
                /* CUSTOM LISTS */
                .transcript-item { display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 15px 20px; border-radius: 8px; margin-bottom: 10px; color: white; text-decoration: none; border-left: 3px solid var(--discord); transition: 0.3s;}
                .transcript-item:hover { background: rgba(88, 101, 242, 0.1); padding-left: 25px;}
                .view-btn { font-size: 12px; background: rgba(255,255,255,0.1); padding: 5px 10px; border-radius: 5px; color: var(--text-muted); }

                .log-item { background: rgba(0,0,0,0.3); border-radius: 8px; margin-bottom: 12px; overflow: hidden; border-left: 4px solid transparent;}
                .log-item.badge-warning { border-color: var(--warning); }
                .log-item.badge-orange { border-color: #e67e22; }
                .log-item.badge-danger { border-color: var(--danger); }
                .log-header { padding: 10px 15px; background: rgba(255,255,255,0.03); display: flex; justify-content: space-between; font-size: 12px; font-weight: bold;}
                .log-body { padding: 15px; font-size: 14px; line-height: 1.6;}
                .log-body .target { color: white; }
                .log-body .staff { color: var(--accent); }
                .log-reason { color: var(--text-muted); display: block; margin-top: 5px; font-style: italic;}

                .active-ticket-item { display: flex; align-items: center; gap: 15px; background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; margin-bottom: 10px;}
                .ticket-icon { font-size: 20px; }
                .ticket-info b { display: block; color: var(--accent); margin-bottom: 4px;}
                .ticket-info span { font-size: 12px; color: var(--text-muted);}

                /* TOAST NOTIFICATION */
                .toast { position: fixed; bottom: -100px; right: 40px; background: var(--success); color: #000; padding: 16px 25px; border-radius: 10px; font-weight: 700; box-shadow: 0 10px 30px rgba(46, 204, 113, 0.3); transition: bottom 0.4s cubic-bezier(0.16, 1, 0.3, 1); z-index: 1000; display: flex; align-items: center; gap: 10px;}
                .toast.show { bottom: 40px; }
                
                .text-muted { color: var(--text-muted); }
            </style>
            <script>
                function openTab(tabId, tabName, tabDesc) {
                    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
                    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
                    
                    document.getElementById(tabId).classList.add('active');
                    document.querySelector('.nav-item[onclick*="' + tabId + '"]').classList.add('active');
                    
                    document.getElementById('header-title').innerText = tabName;
                    document.getElementById('header-desc').innerText = tabDesc;
                    
                    localStorage.setItem('evoPanelActiveTab', tabId);
                    localStorage.setItem('evoPanelActiveName', tabName);
                    localStorage.setItem('evoPanelActiveDesc', tabDesc);
                }

                function addQuestion(formId, borderColor) {
                    const list = document.getElementById('q_list_' + formId);
                    const count = list.children.length;
                    const div = document.createElement('div');
                    div.className = 'form-group border-' + borderColor;
                    div.style.position = 'relative';
                    div.innerHTML = '<label>Question ' + (count + 1) + '</label>' +
                                    '<input type="text" name="' + formId + '_q[]" placeholder="Write the question...">' +
                                    '<button type="button" onclick="this.parentElement.remove()" style="position:absolute; right:20px; top:15px; background:var(--danger); border:none; padding:5px 10px; color:white; border-radius:5px; cursor:pointer;">Delete</button>';
                    list.appendChild(div);
                }

                window.onload = function() {
                    const savedTab = localStorage.getItem('evoPanelActiveTab') || 'tab-setari';
                    const savedName = localStorage.getItem('evoPanelActiveName') || 'General Settings';
                    const savedDesc = localStorage.getItem('evoPanelActiveDesc') || 'Configure the base channels and roles of the server.';
                    
                    if (document.getElementById(savedTab)) {
                        openTab(savedTab, savedName, savedDesc);
                    }

                    const urlParams = new URLSearchParams(window.location.search);
                    if(urlParams.get('saved') === 'true') {
                        const toast = document.getElementById("toastMsg");
                        toast.classList.add("show");
                        setTimeout(() => toast.classList.remove("show"), 3500);
                        window.history.replaceState({}, document.title, "/");
                    }
                }
            </script>
        </head>
        <body>
            <div class="sidebar">
                <div class="sidebar-header">
                    <div class="logo">EVO<span>CRAFT</span></div>
                </div>
                <div class="nav-menu">
                    <div class="nav-item active" onclick="openTab('tab-setari', 'General Settings', 'Configure the base channels and roles of the server.')">⚙️ Base Configurations</div>
                    <div class="nav-item" onclick="openTab('tab-roluri', 'Role Manager', 'Set the roles that players can take via buttons.')">🎭 Button Roles</div>
                    <div class="nav-item" onclick="openTab('tab-formulare', 'Forms System', 'Edit questions for Staff/Media applications (unlimited).')">📝 Staff Applications</div>
                    <div class="nav-item" onclick="openTab('tab-tickete', 'Ticket Archive', 'View web logs for closed tickets.')">🗂️ Transcripts</div>
                    <div class="nav-item" onclick="openTab('tab-penalizari', 'Live Monitoring', 'See recent penalties and open tickets in real-time.')">⚖️ Logs & Live</div>
                    <div class="nav-item" onclick="openTab('tab-jucatori', 'Player Records', 'View accounts and detect multi-account connections (HWID).')">👥 Players HWID</div>
                </div>
                <div class="sidebar-footer">
                    <img src="${req.session.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="Avatar" class="user-avatar">
                    <div class="user-info">
                        <div class="user-name">${req.session.username || 'Admin'}</div>
                        <div class="user-role">${displayRoleName}</div>
                    </div>
                    <a href="/logout" class="logout-btn" title="Logout">🚪</a>
                </div>
            </div>

            <div class="main-content">
                <div class="page-header">
                    <h1 class="page-title" id="header-title">General Settings</h1>
                    <p class="page-desc" id="header-desc">Configure the base channels and roles of the server.</p>
                </div>

                <div id="toastMsg" class="toast">✅ Changes saved successfully!</div>
                
                <div id="tab-setari" class="tab-content active">
                    <form action="/update-channels" method="POST">
                        <div class="grid-2">
                            <div class="card">
                                <h2 class="card-title">🛡️ Role <span>Configuration</span></h2>
                                <div class="form-group border-accent">
                                    <label>Staff Role (Ticket Access)</label>
                                    <select name="staffRole" ${disabledAttr}>${staffRoleOptions}</select>
                                </div>
                                <div class="form-group">
                                    <label>Auto-Role (Received on join)</label>
                                    <select name="autoRole" ${disabledAttr}>${roleOptions}</select>
                                </div>
                                <div class="form-group border-success">
                                    <label>Verified Role (On /link command)</label>
                                    <select name="verifiedRole" ${disabledAttr}>${verifiedRoleOptions}</select>
                                </div>
                                <div class="form-group border-danger">
                                    <label>Soft-Ban Role (User isolation)</label>
                                    <select name="softBanRole" ${disabledAttr}>${softBanRoleOptions}</select>
                                </div>
                            </div>

                            <div class="card">
                                <h2 class="card-title">📡 Channel <span>Configuration</span></h2>
                                <div class="form-group">
                                    <label>Tickets Category</label>
                                    <select name="ticketCategory" ${disabledAttr}>${categoryOptions}</select>
                                </div>
                                <div class="form-group border-danger">
                                    <label>Unban Requests Category (Isolation)</label>
                                    <select name="unbanCategory" ${disabledAttr}>${unbanCategoryOptions}</select>
                                </div>
                                <div class="form-group">
                                    <label>Welcome Channel (Join/Leave)</label>
                                    <select name="welcomeChannel" ${disabledAttr}>${welcomeOptions}</select>
                                </div>
                                <div class="form-group">
                                    <label>Staff Reports Channel (Applications)</label>
                                    <select name="staffChannel" ${disabledAttr}>${staffOptions}</select>
                                </div>
                                <div class="form-group border-warning">
                                    <label>Ticket Archive Channel (Transcripts)</label>
                                    <select name="transcriptsChannel" ${disabledAttr}>${transcriptsOptions}</select>
                                </div>
                            </div>
                        </div>

                        <div class="card" style="margin-bottom: 30px;">
                            <h2 class="card-title">⚙️ System <span>Channels</span></h2>
                            <div class="grid-2" style="margin-bottom: 0;">
                                <div class="form-group" style="margin-bottom: 0;">
                                    <label>Live Minecraft Status Channel</label>
                                    <select name="mcStatusChannel" ${disabledAttr}>${mcStatusOptions}</select>
                                </div>
                                <div class="form-group" style="margin-bottom: 0;">
                                    <label>Audit Channel (Message deletions)</label>
                                    <select name="logsChannel" ${disabledAttr}>${logsOptions}</select>
                                </div>
                                <div class="form-group border-danger" style="margin-bottom: 0;">
                                    <label>Moderation Logs Channel</label>
                                    <select name="modLogsChannel" ${disabledAttr}>${modLogsOptions}</select>
                                </div>
                            </div>
                        </div>

                        <button type="submit" class="btn-primary" style="max-width: 300px; display: block; margin: 0 auto; ${displaySaveBtn}">💾 Save Configuration</button>
                    </form>
                </div>

                <div id="tab-roluri" class="tab-content">
                    <div class="card">
                        <h2 class="card-title">🎭 Button Roles <span>Setup</span></h2>
                        <p class="text-muted" style="margin-bottom: 25px;">These are the roles players can select automatically. After saving, use the <b>/setuproles</b> command on the server.</p>
                        <form action="/update-roles" method="POST">
                            ${htmlRoles}
                            <button type="submit" class="btn-primary" style="max-width: 300px; margin-top: 20px; ${displaySaveBtn}">💾 Save Roles</button>
                        </form>
                    </div>
                </div>

                <div id="tab-formulare" class="tab-content">
                    <div class="grid-2">
                        <div class="card">
                            <h2 class="card-title">📝 Application <span>Form 1</span></h2>
                            <p class="text-muted" style="margin-bottom: 20px; font-size:13px;">This form will be given via Private Message to the user, step by step.<br>Server command: <b>/setupform1</b></p>
                            <form action="/update-form1" method="POST">
                                <div class="form-group">
                                    <label>Form Title</label>
                                    <input type="text" name="f1_titlu" value="${db.formulare.form1.titlu}" ${disabledAttr}>
                                </div>
                                ${htmlForm1}
                                <button type="submit" class="btn-primary" style="${displaySaveBtn}">💾 Save Form 1</button>
                            </form>
                        </div>

                        <div class="card">
                            <h2 class="card-title">📝 Application <span>Form 2</span></h2>
                            <p class="text-muted" style="margin-bottom: 20px; font-size:13px;">This form will be given via Private Message to the user, step by step.<br>Server command: <b>/setupform2</b></p>
                            <form action="/update-form2" method="POST">
                                <div class="form-group">
                                    <label>Form Title</label>
                                    <input type="text" name="f2_titlu" value="${db.formulare.form2.titlu}" ${disabledAttr}>
                                </div>
                                ${htmlForm2}
                                <button type="submit" class="btn-primary" style="background: linear-gradient(135deg, var(--danger), #ff6b81); ${displaySaveBtn}">💾 Save Form 2</button>
                            </form>
                        </div>
                    </div>
                </div>

                <div id="tab-tickete" class="tab-content">
                    <div class="card">
                        <h2 class="card-title">🗂️ Closed Tickets <span>Web History</span></h2>
                        <p class="text-muted" style="margin-bottom: 25px;">All conversations from closed tickets are saved here as independent HTML pages for maximum security.</p>
                        <div style="max-height: 500px; overflow-y: auto; padding-right: 10px;">
                            ${htmlTranscripts}
                        </div>
                    </div>
                </div>

                <div id="tab-penalizari" class="tab-content">
                    <div class="grid-2">
                        <div class="card">
                            <h2 class="card-title">⚖️ Sanctions <span>History</span></h2>
                            <div style="max-height: 450px; overflow-y: auto; padding-right: 10px;">
                                ${htmlPenalizari}
                            </div>
                        </div>

                        <div class="card">
                            <h2 class="card-title">🟢 Active Tickets <span>Monitoring</span></h2>
                            <div style="max-height: 450px; overflow-y: auto; padding-right: 10px;">
                                ${htmlActiveTickets}
                            </div>
                        </div>
                    </div>
                </div>

                <div id="tab-jucatori" class="tab-content">
                    <div class="card">
                        <h2 class="card-title">👥 Players List & <span>HWID</span></h2>
                        <p class="text-muted" style="margin-bottom: 25px;">Easily check for multiple accounts (Alts). Players are grouped by HWID, and those with multiple accounts on the same device appear first in the list.</p>
                        <div style="max-height: 600px; overflow-y: auto; padding-right: 10px;">
                            ${htmlJucatori}
                        </div>
                    </div>
                </div>

            </div>
        </body>
        </html>
        `;
        res.send(htmlContent);
    });

    app.post('/update-channels', (req, res) => {
        if (!req.session.isAdmin) return res.redirect('/');
        db.serverConfig.autoRole = req.body.autoRole; 
        db.serverConfig.staffRole = req.body.staffRole; 
        db.serverConfig.verifiedRole = req.body.verifiedRole; 
        db.serverConfig.softBanRole = req.body.softBanRole;
        db.serverConfig.welcomeChannel = req.body.welcomeChannel;
        db.serverConfig.staffChannel = req.body.staffChannel;
        db.serverConfig.transcriptsChannel = req.body.transcriptsChannel;
        db.serverConfig.ticketCategory = req.body.ticketCategory;
        db.serverConfig.unbanCategory = req.body.unbanCategory;
        db.serverConfig.mcStatusChannel = req.body.mcStatusChannel;
        db.serverConfig.logsChannel = req.body.logsChannel; 
        db.serverConfig.modLogsChannel = req.body.modLogsChannel; 
        db.serverConfig.mcStatusMessageId = ''; 
        saveDatabase(); 
        updateMCStatus(client); 
        console.log('✅ General settings have been saved!');
        res.redirect('/?saved=true');
    });

    app.post('/update-roles', (req, res) => {
        if (!req.session.isAdmin) return res.redirect('/');
        for(let i=0; i<3; i++) {
            db.roluri[i].emoji = req.body[`r${i}_emoji`];
            db.roluri[i].nume = req.body[`r${i}_nume`];
            db.roluri[i].id = req.body[`r${i}_id`];
        }
        saveDatabase(); 
        console.log('✅ Roles have been saved!');
        res.redirect('/?saved=true');
    });

    app.post('/update-form1', (req, res) => {
        if (!req.session.isAdmin) return res.redirect('/');
        let qs = req.body.f1_q; 
        if (typeof qs === 'string') qs = [qs];
        if (!qs) qs = [];
        
        db.formulare.form1.titlu = req.body.f1_titlu || 'Application 1';
        db.formulare.form1.questions = qs.filter(q => q.trim() !== '');
        saveDatabase(); 
        res.redirect('/?saved=true');
    });

    app.post('/update-form2', (req, res) => {
        if (!req.session.isAdmin) return res.redirect('/');
        let qs = req.body.f2_q; 
        if (typeof qs === 'string') qs = [qs];
        if (!qs) qs = [];
        
        db.formulare.form2.titlu = req.body.f2_titlu || 'Application 2';
        db.formulare.form2.questions = qs.filter(q => q.trim() !== '');
        saveDatabase(); 
        res.redirect('/?saved=true');
    });

    app.get('/transcript/:id', (req, res) => {
        const id = req.params.id;
        const filePath = path.join(TRANSCRIPTS_DIR, `${id}.html`);

        if (!fs.existsSync(filePath)) {
            return res.send('<h1 style="color:white; font-family:sans-serif; text-align:center; padding:50px; background:#1e1f22;">Transcript does not exist in the folder.</h1>');
        }

        const continut = fs.readFileSync(filePath, 'utf8');
        res.send(continut);
    });

    app.listen(PORT, () => {
        console.log(`🌐 Total Dashboard started! Access: http://bot.evocraft.ro:${PORT} or your IP.`);
    });
}

module.exports = { startWebPanel };