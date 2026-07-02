const fs = require('fs');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);

const DB_FILE = './database.json';

const db = {
    serverConfig: {
        ticketCategory: '',
        unbanCategory: '',
        staffChannel: '',
        transcriptsChannel: '',
        welcomeChannel: '',
        mcStatusChannel: '',     
        mcStatusMessageId: '',
        logsChannel: '',
        modLogsChannel: '',
        autoRole: '',
        staffRole: '',
        verifiedRole: '',
        softBanRole: ''
    },
    stats: {
        maxMcPlayersRecord: 0 
    },
    formulare: {
        form1: { titlu: 'Aplicație Staff', questions: ['Cum te numești și câți ani ai?', 'De ce dorești acest grad?'] },
        form2: { titlu: 'Aplicație Media', questions: ['Care este link-ul canalului tău?', 'Câți abonați ai?'] }
    },
    roluri: [
        { nume: 'Aventurier', emoji: '⚔️', id: '' },
        { nume: 'Constructor', emoji: '🔨', id: '' },
        { nume: 'Miner', emoji: '⛏️', id: '' }
    ],
    linkedAccounts: {},
    warns: {},
    savedRoles: {},
    penalizari: [],
    softBannedUsers: {}
};

if (fs.existsSync(DB_FILE)) {
    const rawData = fs.readFileSync(DB_FILE, 'utf8');
    let loadedDb = JSON.parse(rawData);
    
    if(!loadedDb.serverConfig.mcStatusChannel) loadedDb.serverConfig.mcStatusChannel = '';
    if(!loadedDb.serverConfig.mcStatusMessageId) loadedDb.serverConfig.mcStatusMessageId = '';
    if(!loadedDb.serverConfig.logsChannel) loadedDb.serverConfig.logsChannel = '';
    if(!loadedDb.serverConfig.modLogsChannel) loadedDb.serverConfig.modLogsChannel = '';
    if(!loadedDb.serverConfig.transcriptsChannel) loadedDb.serverConfig.transcriptsChannel = '';
    if(!loadedDb.serverConfig.autoRole) loadedDb.serverConfig.autoRole = '';
    if(!loadedDb.serverConfig.staffRole) loadedDb.serverConfig.staffRole = ''; 
    if(!loadedDb.serverConfig.verifiedRole) loadedDb.serverConfig.verifiedRole = ''; 
    if(!loadedDb.serverConfig.softBanRole) loadedDb.serverConfig.softBanRole = '';
    if(!loadedDb.serverConfig.unbanCategory) loadedDb.serverConfig.unbanCategory = '';
    if(!loadedDb.stats) loadedDb.stats = { maxMcPlayersRecord: 0 };
    if(!loadedDb.roluri) loadedDb.roluri = db.roluri;
    if(!loadedDb.linkedAccounts) loadedDb.linkedAccounts = {}; 
    if(!loadedDb.warns) loadedDb.warns = {}; 
    if(!loadedDb.savedRoles) loadedDb.savedRoles = {};
    if(!loadedDb.penalizari) loadedDb.penalizari = [];
    if(!loadedDb.softBannedUsers) loadedDb.softBannedUsers = {};
    if(!loadedDb.formulare) loadedDb.formulare = db.formulare;

    // Migrare baza de date veche formulare spre noul format tip array
    if (loadedDb.formulare.form1.intrebari) {
        loadedDb.formulare.form1.questions = loadedDb.formulare.form1.intrebari.map(q => q.label);
        delete loadedDb.formulare.form1.intrebari;
    }
    if (loadedDb.formulare.form2.intrebari) {
        loadedDb.formulare.form2.questions = loadedDb.formulare.form2.intrebari.map(q => q.label);
        delete loadedDb.formulare.form2.intrebari;
    }
    
    if (loadedDb.transcripts) delete loadedDb.transcripts;
    if (loadedDb.pendingLinks) delete loadedDb.pendingLinks; 

    // Îmbinăm obiectul original cu cel încărcat pentru a păstra referința în memorie
    for (let key in db) delete db[key];
    Object.assign(db, loadedDb);

    console.log('📂 Baza de date a fost încărcată și actualizată în memorie!');
} else {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4));
    console.log('📄 Fișierul database.json a fost creat!');
}

async function saveDatabase() {
    try {
        await writeFileAsync(DB_FILE, JSON.stringify(db, null, 4));
    } catch (err) {
        console.error('Eroare la salvarea bazei de date:', err);
    }
}

module.exports = { db, saveDatabase };