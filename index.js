const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType, 
    PermissionsBitField,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    Options,
    Partials,
    ApplicationCommandOptionType
} = require('discord.js');
require('dotenv').config();
const fs = require('fs'); 
const path = require('path');
const cheerio = require('cheerio'); 

const { db, saveDatabase } = require('./database');
const { updateMCStatus, sendModLog, createTicketChannel } = require('./utils');
const { startWebPanel } = require('./web');

// --- PREPARE DIRECTORIES FOR FILES ---
const TRANSCRIPTS_DIR = path.join(__dirname, 'transcripts');
if (!fs.existsSync(TRANSCRIPTS_DIR)) {
    fs.mkdirSync(TRANSCRIPTS_DIR);
    console.log('📁 Folder "transcripts" was created to save tickets!');
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.DirectMessages // ADDED FOR THE PRIVATE APPLICATIONS SYSTEM
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
    // --- EXTREME RAM OPTIMIZATION ---
    makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        MessageManager: 100, 
        PresenceManager: 0, 
        ReactionManager: 0, 
        ThreadManager: 10,  
        GuildMemberManager: { maxSize: 500, keepOverLimit: member => member.id === client.user.id },
    })
});

// --- ANTI-CRASH SYSTEM ---
process.on('unhandledRejection', (reason, promise) => {
    console.log(' [ANTI-CRASH] Error (Unhandled Rejection) at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err, origin) => {
    console.log(' [ANTI-CRASH] Critical Error (Uncaught Exception):', err, 'Origin:', origin);
});

// --- STATE MANAGEMENT FOR PRIVATE APPLICATIONS (DMS) ---
const activeInterviews = new Map();

client.once('clientReady', async () => {
    console.log(`Bot is online! Successfully logged in as ${client.user.tag}`);

    setInterval(() => updateMCStatus(client), 60000);
    updateMCStatus(client); 

    const commands = [
        { name: 'setupticket', description: 'Send the classic ticket panel (No verification)' },
        { name: 'setupticket_link', description: 'Send the advanced ticket panel (With account verification)' },
        { name: 'setupform1', description: 'Send the panel for Form 1 (Admin)' },
        { name: 'setupform2', description: 'Send the panel for Form 2 (Admin)' },
        { name: 'setuproles', description: 'Send the Button Roles panel (Admin)' },
        { name: 'launcher', description: 'Download the official EvoCraft launcher' },
        { name: 'tutorial', description: 'Watch the official EvoCraft video tutorial' },
        { 
            name: 'clear', 
            description: 'Delete a specific number of messages from this channel (Staff)',
            options: [
                { name: 'amount', description: 'How many messages do you want to delete? (1-100)', type: ApplicationCommandOptionType.Integer, required: true }
            ]
        },
        {
            name: 'timeout',
            description: 'Timeout (mute) a member on the server (Staff)',
            options: [
                { name: 'member', description: 'The user you want to penalize', type: ApplicationCommandOptionType.User, required: true },
                { name: 'minutes', description: 'Time in minutes', type: ApplicationCommandOptionType.Integer, required: true },
                { name: 'reason', description: 'Reason for the timeout', type: ApplicationCommandOptionType.String, required: false }
            ]
        },
        {
            name: 'warn',
            description: 'Warn a member (Staff)',
            options: [
                { name: 'member', description: 'The member you want to warn', type: ApplicationCommandOptionType.User, required: true },
                { name: 'reason', description: 'The reason for the warning', type: ApplicationCommandOptionType.String, required: true }
            ]
        },
        {
            name: 'warns',
            description: 'View a member\'s warnings (Staff)',
            options: [
                { name: 'member', description: 'The member whose warnings you want to see', type: ApplicationCommandOptionType.User, required: true }
            ]
        },
        {
            name: 'announce',
            description: 'Send an official announcement as an Embed (Staff)',
            options: [
                { name: 'title', description: 'The title of the announcement', type: ApplicationCommandOptionType.String, required: true },
                { name: 'message', description: 'The content of the announcement', type: ApplicationCommandOptionType.String, required: true },
                { name: 'channel', description: 'The channel where the announcement will be sent (optional)', type: ApplicationCommandOptionType.Channel, required: false }
            ]
        },
        {
            name: 'postrules',
            description: 'Fetch the rules directly from the site (evocraft.ro) and post them here (Admin)',
            options: [
                { name: 'channel', description: 'The channel where you want to post the rules', type: ApplicationCommandOptionType.Channel, required: true }
            ]
        },
        {
            name: 'link',
            description: 'Link your Discord account with your Minecraft account (You will receive the Verified Role)',
            options: [
                { name: 'code', description: 'The 6-digit code generated from the Launcher', type: ApplicationCommandOptionType.String, required: true }
            ]
        },
        {
            name: 'forcelink',
            description: 'Manually link a Minecraft account to a Discord member (Admin)',
            options: [
                { name: 'member', description: 'The Discord member', type: ApplicationCommandOptionType.User, required: true },
                { name: 'mc_name', description: 'The in-game name', type: ApplicationCommandOptionType.String, required: true }
            ]
        },
        {
            name: 'unlink',
            description: 'Remove a Minecraft account link from the bot memory and database (Admin)',
            options: [
                { name: 'member', description: 'The Discord member to unlink', type: ApplicationCommandOptionType.User, required: true }
            ]
        },
        {
            name: 'ban',
            description: 'Soft-ban for a user (Jail/Isolate in a special appeal channel)',
            options: [
                { name: 'member', description: 'The user who receives the soft-ban', type: ApplicationCommandOptionType.User, required: true },
                { name: 'reason', description: 'The reason for the soft-ban', type: ApplicationCommandOptionType.String, required: true }
            ]
        },
        {
            name: 'unban',
            description: 'Remove the soft-ban from a user',
            options: [
                { name: 'member', description: 'The user you are removing the soft-ban from', type: ApplicationCommandOptionType.User, required: true }
            ]
        }
    ];

    try {
        await client.application.commands.set(commands);
        console.log('Slash (/) commands have been loaded!');
    } catch (error) {
        console.error('Error loading commands:', error);
    }

    // START WEB PANEL
    startWebPanel(client, TRANSCRIPTS_DIR);
});

// --- AUTOMATIC LINK MODERATION SYSTEM (ANTI-INVITE) ---
client.on('messageCreate', async message => {
    
    // --- APPLICATIONS SYSTEM (PRIVATE MESSAGES) ---
    if (message.channel.type === ChannelType.DM && !message.author.bot) {
        if (activeInterviews.has(message.author.id)) {
            let interview = activeInterviews.get(message.author.id);
            
            if (interview.status === 'AWAITING_ANSWER') {
                interview.tempAnswer = message.content;
                interview.status = 'CONFIRMING';

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('interview_confirm').setLabel('I agree').setStyle(ButtonStyle.Success).setEmoji('✅'),
                    new ButtonBuilder().setCustomId('interview_edit').setLabel('Edit (Write another answer)').setStyle(ButtonStyle.Danger).setEmoji('✏️')
                );

                const msg = await message.author.send({
                    content: `**Your answer has been temporarily recorded:**\n\`\`\`${message.content}\`\`\`\nAre you okay with this answer or do you want to edit it? (Use the buttons below)`,
                    components: [row]
                });
                interview.lastBotMsg = msg.id;
            } else if (interview.status === 'CONFIRMING') {
                await message.author.send('⚠️ Use the buttons on the previous message to confirm or edit your answer before writing anything else!');
            }
        }
        return; // Stop server checks (warn/anti-invite) in private
    }

    // --- END APPLICATIONS SYSTEM DMS ---

    if (message.author?.bot) return; 
    if (message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    const inviteRegex = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite|discord\.com\/invite)\/[a-zA-Z0-9]+/i;
    
    if (inviteRegex.test(message.content)) {
        await message.delete().catch(() => {}); 
        
        return message.channel.send({ content: `🚫 <@${message.author.id}>, sending links to other Discord servers is strictly forbidden!` })
            .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
    }
});

// --- ADVANCED LOGS SYSTEM (AUDIT) ---
client.on('messageDelete', async message => {
    if (message.author?.bot) return;
    if (!db.serverConfig.logsChannel) return;
    
    const logsChannel = message.guild.channels.cache.get(db.serverConfig.logsChannel);
    if (!logsChannel) return;

    const embed = new EmbedBuilder()
        .setTitle('🗑️ Deleted Message')
        .setColor('#e74c3c')
        .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
        .addFields(
            { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
            { name: 'Content', value: message.content ? message.content : '*Message had no text content (possibly embed/image)*', inline: false }
        )
        .setFooter({ text: `Message ID: ${message.id} | User ID: ${message.author.id}` })
        .setTimestamp();

    await logsChannel.send({ embeds: [embed] }).catch(() => {});
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return; 
    if (!db.serverConfig.logsChannel) return;

    const logsChannel = newMessage.guild.channels.cache.get(db.serverConfig.logsChannel);
    if (!logsChannel) return;

    const embed = new EmbedBuilder()
        .setTitle('✏️ Edited Message')
        .setColor('#f1c40f')
        .setAuthor({ name: newMessage.author.tag, iconURL: newMessage.author.displayAvatarURL() })
        .addFields(
            { name: 'Channel', value: `<#${newMessage.channel.id}>`, inline: true },
            { name: 'Old', value: oldMessage.content ? oldMessage.content : '*No content*', inline: false },
            { name: 'New', value: newMessage.content ? newMessage.content : '*No content*', inline: false }
        )
        .setFooter({ text: `User ID: ${newMessage.author.id}` })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('View Message').setURL(newMessage.url).setStyle(ButtonStyle.Link)
    );

    await logsChannel.send({ embeds: [embed], components: [row] }).catch(() => {});
});

// --- DISCORD EVENTS (JOIN/LEAVE & AUTO-ROLE & ANTI-BYPASS) ---
client.on('guildMemberAdd', async member => {
    
    // --- ANTI-BYPASS BAN SYSTEM ---
    if (db.softBannedUsers && db.softBannedUsers[member.id]) {
        console.log(`[ANTI-BYPASS] User ${member.user.tag} rejoined with an active soft-ban. Applying isolation again.`);
        if (db.serverConfig.softBanRole) {
            const banRole = member.guild.roles.cache.get(db.serverConfig.softBanRole);
            if (banRole) {
                await member.roles.add(banRole).catch(() => {});
            }
        }
        return; 
    }
    // --- END ANTI-BYPASS SYSTEM ---

    if (db.serverConfig.autoRole) {
        const role = member.guild.roles.cache.get(db.serverConfig.autoRole);
        if (role) {
            await member.roles.add(role).catch(err => console.log('Error granting Auto-Role:', err));
        }
    }

    if (!db.serverConfig.welcomeChannel) return;
    const welcomeChannel = member.guild.channels.cache.get(db.serverConfig.welcomeChannel);
    if (!welcomeChannel) return; 

    const welcomeEmbed = new EmbedBuilder()
        .setColor('#2ECC71') 
        .setTitle('✨ A NEW EXPLORER HAS ARRIVED! ⛏️')
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 })) 
        .setDescription(`Welcome to our server, <@${member.id}>! We hope you have a great time with the EvoCraft community. Get ready for adventure!`)
        .addFields(
            { name: '📋 Useful Information', value: 'Please read our rules and choose your roles.', inline: false },
            { name: '👥 Members on Server', value: `We are now **${member.guild.memberCount}** brave explorers!`, inline: false }
        )
        .setFooter({ text: `Enjoy your stay! | EvoCraft`, iconURL: member.guild.iconURL({ dynamic: true }) })
        .setTimestamp();

    await welcomeChannel.send({ content: `<@${member.id}>`, embeds: [welcomeEmbed] });
});

client.on('guildMemberRemove', async member => {
    if (!db.serverConfig.welcomeChannel) return;
    const welcomeChannel = member.guild.channels.cache.get(db.serverConfig.welcomeChannel);
    if (!welcomeChannel) return;

    const leaveEmbed = new EmbedBuilder()
        .setColor('#E74C3C')  
        .setTitle('❌ AN ADVENTURE HAS ENDED')
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 }))
        .setDescription(`We are sorry to see <@${member.id}> (ID: ${member.id}) leaving EvoCraft.`)
        .addFields(
            { name: '💔 Retired from the game', value: 'We hope you will return soon. The gate remains open for you!', inline: false },
            { name: '👥 Remaining Members', value: `We are left with ${member.guild.memberCount} explorers on the server.`, inline: false }
        )
        .setFooter({ text: `EvoCraft Server`, iconURL: member.guild.iconURL({ dynamic: true }) })
        .setTimestamp();

    await welcomeChannel.send({ embeds: [leaveEmbed] });
});

// --- DISCORD INTERACTIONS ---
client.on('interactionCreate', async interaction => {
    
    // --- INTERVIEW CONFIRM/EDIT BUTTONS IN PRIVATE ---
    if (interaction.isButton() && (interaction.customId === 'interview_confirm' || interaction.customId === 'interview_edit')) {
        if (!activeInterviews.has(interaction.user.id)) {
            return interaction.reply({ content: '❌ Session expired.', ephemeral: true });
        }
        let interview = activeInterviews.get(interaction.user.id);

        if (interaction.customId === 'interview_edit') {
            interview.status = 'AWAITING_ANSWER';
            await interaction.update({ content: '✏️ Please write a new answer for the question in the chat.', components: [] });
        } else {
            interview.answers.push({ q: interview.questions[interview.currentIdx], a: interview.tempAnswer });
            interview.currentIdx++;

            if (interview.currentIdx >= interview.questions.length) {
                await interaction.update({ content: '✅ Your application has been successfully completed and sent to the staff!', components: [] });

                let finalDesc = '';
                interview.answers.forEach((ans, i) => {
                    finalDesc += `**${i + 1}. ${ans.q}**\n${ans.a}\n\n`;
                });

                const finalEmbed = new EmbedBuilder()
                    .setTitle(`📝 Completed Application: ${interview.formTitle}`)
                    .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
                    .setDescription(finalDesc.substring(0, 4000))
                    .setColor('Purple')
                    .setTimestamp()
                    .setFooter({ text: `Account ID: ${interaction.user.id}` });

                await interaction.user.send({ embeds: [finalEmbed] });

                if (db.serverConfig.staffChannel) {
                    const staffChan = client.channels.cache.get(db.serverConfig.staffChannel);
                    if (staffChan) {
                        const btnAccept = new ButtonBuilder().setCustomId(`staff_accept_${interaction.user.id}`).setLabel('Accept Application').setStyle(ButtonStyle.Success);
                        const btnReject = new ButtonBuilder().setCustomId(`staff_reject_${interaction.user.id}`).setLabel('Reject Application').setStyle(ButtonStyle.Danger);
                        const rowStaff = new ActionRowBuilder().addComponents(btnAccept, btnReject);
                        await staffChan.send({ embeds: [finalEmbed], components: [rowStaff] });
                    }
                }

                activeInterviews.delete(interaction.user.id);
            } else {
                interview.status = 'AWAITING_ANSWER';
                await interaction.update({ content: `✅ Answer saved.\n\n**Question ${interview.currentIdx + 1}/${interview.questions.length}:**\n${interview.questions[interview.currentIdx]}`, components: [] });
            }
        }
        return; 
    }

    if (interaction.isChatInputCommand()) {
        
        const adminCommands = ['setupticket', 'setupticket_link', 'setupform1', 'setupform2', 'setuproles', 'postrules', 'forcelink', 'unlink'];
        if (adminCommands.includes(interaction.commandName)) {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: 'You don\'t have permissions!', ephemeral: true });
            }
        }

        if (interaction.commandName === 'tutorial') {
            await interaction.reply({ 
                content: '**🎥 Watch the official EvoCraft tutorial here:**\nhttps://www.youtube.com/watch?v=6NbrpMjGnj4' 
            });
        }

        if (interaction.commandName === 'launcher') {
            const embed = new EmbedBuilder()
                .setTitle('🚀 Download EvoCraft Launcher')
                .setDescription('Jump straight into the action! Download the official EvoCraft installer to automatically have all the necessary mods configured perfectly.\n\n🔗 **[Click the button below to download]**')
                .setColor('#2ecc71')
                .setThumbnail(client.user.displayAvatarURL());

            const btn = new ButtonBuilder()
                .setLabel('Download Now')
                .setURL('https://evocraft.ro/download/EvoCraftInstaller.exe') 
                .setStyle(ButtonStyle.Link)
                .setEmoji('📥');

            await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
        }

        if (interaction.commandName === 'setupticket') {
            const embed = new EmbedBuilder()
                .setTitle('🎫 Support Center (Tickets)')
                .setDescription('Are you facing an issue, found a bug, or want to donate?\nClick the button below to open a private conversation with the Staff team.')
                .setColor('#2ecc71')
                .setImage('https://i.imgur.com/example_banner.png'); 
            const btn = new ButtonBuilder().setCustomId('btn_create_ticket_classic').setLabel('Create ticket').setEmoji('✉️').setStyle(ButtonStyle.Success);
            await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
            await interaction.reply({ content: 'Classic ticket system set (no verification)!', ephemeral: true });
        }

        if (interaction.commandName === 'setupticket_link') {
            const embed = new EmbedBuilder()
                .setTitle('🎫 Support Center (Advanced Tickets)')
                .setDescription('Are you facing an issue, found a bug, or want to donate?\nClick the button below to choose the correct section and open a private conversation with the Staff team.\n\n🎮 **In-game issues:**\nYou must have your Discord account linked to the game using the `/link` command. *(You can find the connection code in the Launcher settings).*\n\n🚀 **Launcher issues:**\nThis section is strictly for installation or startup bugs.\n\n🚨 **Report a person:**\nDid you witness a rule violation? Report the person you want to complain about here!')
                .setColor('#2ecc71')
                .setImage('https://i.imgur.com/example_banner.png'); 
            const btnInGame = new ButtonBuilder().setCustomId('btn_ingame_ticket').setLabel('Report an in-game issue').setStyle(ButtonStyle.Primary).setEmoji('🎮');
            const btnLauncherIssue = new ButtonBuilder().setCustomId('btn_launcher_ticket').setLabel('Launcher Issues').setStyle(ButtonStyle.Danger).setEmoji('🚀');
            const btnReport = new ButtonBuilder().setCustomId('btn_report_ticket').setLabel('Report person').setStyle(ButtonStyle.Secondary).setEmoji('🚨');
            await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btnInGame, btnLauncherIssue, btnReport)] });
            await interaction.reply({ content: 'Advanced ticket system set (with link/launcher and reports)!', ephemeral: true });
        }

        if (interaction.commandName === 'setupform1') {
            const embed = new EmbedBuilder()
                .setTitle(`📝 ${db.formulare.form1.titlu}`)
                .setDescription('Click the button below to start the application in private.')
                .setColor('#5865F2');
            const btn = new ButtonBuilder().setCustomId('btn_form1').setLabel(db.formulare.form1.titlu).setStyle(ButtonStyle.Primary);
            await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
            await interaction.reply({ content: 'Form 1 set!', ephemeral: true });
        }

        if (interaction.commandName === 'setupform2') {
            const embed = new EmbedBuilder()
                .setTitle(`📝 ${db.formulare.form2.titlu}`)
                .setDescription('Click the button below to start the application in private.')
                .setColor('#E74C3C');
            const btn = new ButtonBuilder().setCustomId('btn_form2').setLabel(db.formulare.form2.titlu).setStyle(ButtonStyle.Danger);
            await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
            await interaction.reply({ content: 'Form 2 set!', ephemeral: true });
        }

        if (interaction.commandName === 'setuproles') {
            let desc = 'Hello! If you wish, choose your corresponding role. This helps the EVO team and other members know who they are interacting with.\n\n---\n\nReact by clicking the buttons below to receive or remove the role.\n';
            
            db.roluri.forEach((rol) => {
                if (rol.nume && rol.id) {
                    desc += `\n${rol.emoji} **${rol.nume}** ➡ Click the button for the role **${rol.nume}**.`;
                }
            });

            desc += '\n\n**Instructions:**\nRole selection is purely voluntary and for community organization. If you change your mind, click the button again.\n';

            const embed = new EmbedBuilder()
                .setTitle('🤝 GET TO KNOW | ROLE SELECTION')
                .setDescription(desc)
                .setColor('#E74C3C') 
                .setFooter({ text: 'Thank you for your cooperation! | EVO Administrative Team' })
                .setTimestamp();
            
            const row = new ActionRowBuilder();
            db.roluri.forEach((rol, index) => {
                if (rol.id && rol.nume) {
                    let btn = new ButtonBuilder().setCustomId(`role_btn_${index}`).setLabel(rol.nume).setStyle(ButtonStyle.Secondary);
                    if (rol.emoji) btn.setEmoji(rol.emoji);
                    row.addComponents(btn);
                }
            });

            if (row.components.length === 0) {
                return interaction.reply({ content: 'Error: You haven\'t set any valid role in the Web Panel!', ephemeral: true });
            }

            await interaction.channel.send({ embeds: [embed], components: [row] });
            await interaction.reply({ content: 'The role panel has been sent!', ephemeral: true });
        }

        if (interaction.commandName === 'clear') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return interaction.reply({ content: '❌ You don\'t have permission to manage messages!', ephemeral: true });
            }
            
            const amount = interaction.options.getInteger('amount');
            
            if (amount < 1 || amount > 100) {
                return interaction.reply({ content: '❌ Choose a valid number between 1 and 100.', ephemeral: true });
            }

            await interaction.channel.bulkDelete(amount, true).catch(err => {
                console.log(err);
                return interaction.reply({ content: '❌ An error occurred while deleting messages (they might be older than 14 days).', ephemeral: true });
            });

            await interaction.reply({ content: `✅ Successfully deleted **${amount}** messages from this channel.`, ephemeral: true });
        }

        if (interaction.commandName === 'timeout') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                return interaction.reply({ content: '❌ You don\'t have permission to timeout members!', ephemeral: true });
            }

            const userVizat = interaction.options.getUser('member');
            const timpMinute = interaction.options.getInteger('minutes');
            const motiv = interaction.options.getString('reason') || 'No reason specified by staff';

            const membruTarget = await interaction.guild.members.fetch(userVizat.id).catch(() => null);

            if (!membruTarget) return interaction.reply({ content: '❌ Cannot find this member on the server.', ephemeral: true });
            if (membruTarget.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot timeout yourself!', ephemeral: true });
            if (membruTarget.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '❌ You cannot timeout an Administrator!', ephemeral: true });

            try {
                await membruTarget.timeout(timpMinute * 60 * 1000, motiv);
                
                db.penalizari.unshift({ type: 'TIMEOUT', target: userVizat.tag, staff: interaction.user.tag, reason: motiv, date: new Date().toLocaleString('en-US') });
                if (db.penalizari.length > 200) db.penalizari.pop();
                saveDatabase();

                await sendModLog(interaction.guild, 'TIMEOUT', '#e67e22', `<@${userVizat.id}> (${userVizat.tag})`, `<@${interaction.user.id}>`, motiv, `Time: ${timpMinute} minutes`);

                await interaction.reply({ content: `🔇 Member **${userVizat.tag}** received a timeout for **${timpMinute} minutes**.\nReason: *${motiv}*` });
            } catch (error) {
                await interaction.reply({ content: '❌ An error occurred. Ensure the bot has its role placed above the targeted user\'s role.', ephemeral: true });
            }
        }

        // --- WARN SYSTEM (SLASH COMMANDS) ---
        if (interaction.commandName === 'warn') {
            const hasStaffRole = db.serverConfig.staffRole && interaction.member.roles.cache.has(db.serverConfig.staffRole);
            const hasAdminPerm = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

            if (!hasStaffRole && !hasAdminPerm) {
                return interaction.reply({ content: '❌ You don\'t have permission to warn members (Requires Staff Role from Panel or Administrator)!', ephemeral: true });
            }

            const targetUser = interaction.options.getUser('member');
            const reason = interaction.options.getString('reason');

            if (targetUser.bot) return interaction.reply({ content: '❌ You cannot warn a bot!', ephemeral: true });
            if (targetUser.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot warn yourself!', ephemeral: true });

            if (!db.warns[targetUser.id]) {
                db.warns[targetUser.id] = [];
            }

            db.warns[targetUser.id].push({
                staffId: interaction.user.id,
                reason: reason,
                date: new Date().toLocaleString('en-US')
            });

            db.penalizari.unshift({ type: 'WARN', target: targetUser.tag, staff: interaction.user.tag, reason: reason, date: new Date().toLocaleString('en-US') });
            if (db.penalizari.length > 200) db.penalizari.pop();

            saveDatabase();

            await sendModLog(interaction.guild, 'WARN', '#f1c40f', `<@${targetUser.id}> (${targetUser.tag})`, `<@${interaction.user.id}>`, reason);

            const warnEmbed = new EmbedBuilder()
                .setTitle('⚠️ Member Warned')
                .setColor('#e67e22')
                .addFields(
                    { name: 'Member', value: `<@${targetUser.id}>`, inline: true },
                    { name: 'Staff', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Reason', value: reason, inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [warnEmbed] });
            
            try {
                await targetUser.send(`⚠️ You received a warning on the server **${interaction.guild.name}**.\n**Reason:** ${reason}`);
            } catch (err) {}
        }

        if (interaction.commandName === 'warns') {
            const hasStaffRole = db.serverConfig.staffRole && interaction.member.roles.cache.has(db.serverConfig.staffRole);
            const hasAdminPerm = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

            if (!hasStaffRole && !hasAdminPerm) {
                return interaction.reply({ content: '❌ You don\'t have permission to view warnings (Requires Staff Role from Panel or Administrator)!', ephemeral: true });
            }

            const targetUser = interaction.options.getUser('member');
            const userWarns = db.warns[targetUser.id] || [];

            if (userWarns.length === 0) {
                return interaction.reply({ content: `✅ Member <@${targetUser.id}> has no active warnings.`, ephemeral: true });
            }

            let currentEmbed = new EmbedBuilder()
                .setTitle(`⚠️ Warning History for ${targetUser.username}`)
                .setColor('#e67e22')
                .setDescription(`Total warnings: **${userWarns.length}**`);

            userWarns.forEach((warn, index) => {
                currentEmbed.addFields({
                    name: `Warn #${index + 1}`,
                    value: `**Reason:** ${warn.reason}\n**Given by:** <@${warn.staffId}>\n**Date:** ${warn.date}`
                });
            });

            await interaction.reply({ embeds: [currentEmbed], ephemeral: true });
        }
        // --- END WARN SYSTEM ---

        if (interaction.commandName === 'announce') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return interaction.reply({ content: '❌ You don\'t have permission to send official announcements!', ephemeral: true });
            }

            const titlu = interaction.options.getString('title');
            const mesaj = interaction.options.getString('message');
            const canalTinta = interaction.options.getChannel('channel') || interaction.channel;

            if (canalTinta.type !== ChannelType.GuildText && canalTinta.type !== ChannelType.GuildAnnouncement) {
                return interaction.reply({ content: '❌ You can only send announcements in text or announcement channels.', ephemeral: true });
            }

            const embedAnnounce = new EmbedBuilder()
                .setTitle(`📢 ${titlu}`)
                .setDescription(mesaj)
                .setColor('#f1c40f')
                .setFooter({ text: `Announcement sent by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            try {
                await canalTinta.send({ embeds: [embedAnnounce] });
                await interaction.reply({ content: `✅ Your announcement was successfully sent to the channel <#${canalTinta.id}>.`, ephemeral: true });
            } catch (error) {
                await interaction.reply({ content: '❌ I don\'t have permission to send messages in that channel!', ephemeral: true });
            }
        }

        if (interaction.commandName === 'postrules') {
            const targetChannel = interaction.options.getChannel('channel');
            
            if (targetChannel.type !== ChannelType.GuildText && targetChannel.type !== ChannelType.GuildAnnouncement) {
                return interaction.reply({ content: '❌ Please select a valid text channel to post the rules.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            try {
                const response = await fetch('https://evocraft.ro/rules.php');
                const html = await response.text();
                
                const $ = cheerio.load(html);
                let embedsDeTrimis = [];

                $('.rule-section').each((index, element) => {
                    let sectionTitle = $(element).find('h2').text().trim();
                    if (!sectionTitle) sectionTitle = `Section ${index + 1}`;
                    
                    let sectionDesc = '';

                    $(element).find('.rule-item').each((i, item) => {
                        let ruleTitle = $(item).find('h3').text().trim();
                        let ruleDesc = $(item).find('p').text().trim();
                        let punishment = $(item).find('.punishment-box').text().trim();
                        
                        if (ruleTitle) sectionDesc += `**${ruleTitle}**\n`;
                        if (ruleDesc) sectionDesc += `${ruleDesc}\n`;
                        if (punishment) sectionDesc += `*${punishment}*\n`;
                        sectionDesc += '\n';
                    });

                    $(element).find('.sanction-card').each((i, card) => {
                        let sTitle = $(card).find('.sanction-title').text().trim();
                        let sDesc = $(card).find('.sanction-desc').text().trim();
                        sectionDesc += `**${sTitle}**\n${sDesc}\n\n`;
                    });

                    if (sectionDesc.length > 0) {
                        const ruleEmbed = new EmbedBuilder()
                            .setTitle(sectionTitle)
                            .setDescription(sectionDesc.substring(0, 4000))
                            .setColor('#2ecc71');
                        
                        embedsDeTrimis.push(ruleEmbed);
                    }
                });

                if (embedsDeTrimis.length === 0) {
                    return interaction.editReply({ content: '❌ Error: Could not read rules from the site. Make sure the site is online.' });
                }

                await targetChannel.send({ 
                    content: '📜 **OFFICIAL EVOCRAFT RULES** 📜\n*These rules are automatically fetched and updated from our official website: https://evocraft.ro/rules.php*',
                    embeds: embedsDeTrimis 
                });

                await interaction.editReply({ content: `✅ The rules have been successfully extracted from the website and posted in <#${targetChannel.id}>!` });

            } catch (error) {
                console.error('Error fetching rules:', error);
                await interaction.editReply({ content: '❌ A connection error occurred with EvoCraft.RO!' });
            }
        }

        if (interaction.commandName === 'link') {
            const code = interaction.options.getString('code');
            
            await interaction.deferReply({ ephemeral: true });

            try {
                const checkResponse = await fetch('http://144.76.98.184:5011/check-discord', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ discord_id: interaction.user.username, auth_key: 'EVOCRAFTSECURITYPASSWORD2026' })
                });
                const checkData = await checkResponse.json();

                if (checkData.status === 'LINKED') {
                    return interaction.editReply({ content: `✅ Your Discord account is already linked with the Minecraft account: **${checkData.username}**!\nYou cannot link another account.` });
                }
            } catch (error) {}

            try {
                const response = await fetch('http://144.76.98.184:5011/verify-discord-link', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        discord_id: interaction.user.username, 
                        code: code,
                        auth_key: 'EVOCRAFTSECURITYPASSWORD2026'
                    })
                });

                const data = await response.json();

                if (data.status === 'SUCCESS') {
                    
                    if (db.serverConfig.verifiedRole) {
                        const role = interaction.guild.roles.cache.get(db.serverConfig.verifiedRole);
                        if (role) {
                            await interaction.member.roles.add(role).catch(err => console.log('Could not add the verified role:', err));
                        }
                    }

                    const embedLink = new EmbedBuilder()
                        .setTitle('🔗 Account Link Successful!')
                        .setDescription(`Congratulations! Your Discord account has been successfully linked to the Minecraft account **${data.username}** directly in the database!`)
                        .setColor('#2ecc71')
                        .setFooter({ text: 'EvoCraft System' });

                    await interaction.editReply({ embeds: [embedLink] });
                } else if (data.status === 'INVALID') {
                    await interaction.editReply({ content: '❌ The entered code is invalid or has expired!' });
                } else {
                    await interaction.editReply({ content: `❌ API Error: ${data.error || 'Unknown'}` });
                }
            } catch (error) {
                await interaction.editReply({ content: '❌ Connection error to the main server (Database). Is the Python API running?' });
            }
        }

        if (interaction.commandName === 'forcelink') {
            const targetUser = interaction.options.getUser('member');
            const mcName = interaction.options.getString('mc_name');

            db.linkedAccounts[targetUser.id] = mcName;
            saveDatabase();

            await interaction.reply({ content: `✅ You manually linked user <@${targetUser.id}> with Minecraft account **${mcName}** in the bot's local database.`, ephemeral: true });
        }

        if (interaction.commandName === 'unlink') {
            const targetUser = interaction.options.getUser('member');
            
            await interaction.deferReply({ ephemeral: true });

            if (db.linkedAccounts[targetUser.id]) {
                delete db.linkedAccounts[targetUser.id];
                saveDatabase();
            }

            try {
                await fetch('http://144.76.98.184:5011/unlink-discord', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        discord_id: targetUser.username,
                        auth_key: 'EVOCRAFTSECURITYPASSWORD2026'
                    })
                });
            } catch (error) {
                console.log('Error during Python unlink-discord call:', error);
            }

            if (db.serverConfig.verifiedRole) {
                try {
                    const memberTarget = await interaction.guild.members.fetch(targetUser.id);
                    if (memberTarget) {
                        const role = interaction.guild.roles.cache.get(db.serverConfig.verifiedRole);
                        if (role && memberTarget.roles.cache.has(role.id)) {
                            await memberTarget.roles.remove(role);
                        }
                    }
                } catch (e) {}
            }

            await interaction.editReply({ content: `✅ Removed the account link for <@${targetUser.id}> from both databases (Bot + MariaDB)! They can now use the \`/link\` command again.` });
        }

        // --- SOFT BAN SYSTEM ---
        if (interaction.commandName === 'ban') {
            const hasStaffRole = db.serverConfig.staffRole && interaction.member.roles.cache.has(db.serverConfig.staffRole);
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers) && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && !hasStaffRole) {
                return interaction.reply({ content: '❌ You do not have permission to ban members!', ephemeral: true });
            }

            const targetUser = interaction.options.getUser('member');
            const reason = interaction.options.getString('reason');
            const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!targetMember) return interaction.reply({ content: '❌ The user was not found on the server.', ephemeral: true });
            if (targetMember.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot ban yourself!', ephemeral: true });
            if (targetMember.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '❌ You cannot ban an Administrator!', ephemeral: true });

            const softBanRoleId = db.serverConfig.softBanRole;
            if (!softBanRoleId) {
                return interaction.reply({ content: '❌ The Soft-Ban role has not been set in the Web Panel (General Settings)!', ephemeral: true });
            }

            const role = interaction.guild.roles.cache.get(softBanRoleId);
            if (!role) {
                return interaction.reply({ content: '❌ The Soft-Ban role set in the panel no longer exists on the server.', ephemeral: true });
            }

            // SAVE AND REMOVE EXISTING ROLES
            const rolesArray = Array.from(targetMember.roles.cache.filter(r => r.id !== interaction.guild.id && !r.managed).keys());
            db.savedRoles[targetUser.id] = rolesArray;
            await targetMember.roles.remove(rolesArray).catch(err => console.log('Error removing current roles:', err));

            await targetMember.roles.add(role).catch(err => {
                console.log('Error adding soft-ban role:', err);
            });

            // SAVE TO DATABASE FOR ANTI-BYPASS
            if (!db.softBannedUsers) db.softBannedUsers = {};
            db.softBannedUsers[targetUser.id] = true;

            db.penalizari.unshift({ type: 'SOFT-BAN', target: targetUser.tag, staff: interaction.user.tag, reason: reason, date: new Date().toLocaleString('en-US') });
            if (db.penalizari.length > 200) db.penalizari.pop();
            saveDatabase();

            await sendModLog(interaction.guild, 'SOFT-BAN (ISOLATION)', '#e74c3c', `<@${targetUser.id}> (${targetUser.tag})`, `<@${interaction.user.id}>`, reason);

            let permissionOverwrites = [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: targetUser.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
            ];

            if (db.serverConfig.staffRole) {
                permissionOverwrites.push({
                    id: db.serverConfig.staffRole,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
                });
            }

            try {
                const unbanChannel = await interaction.guild.channels.create({
                    name: `unban-appeal-${targetUser.username}`,
                    type: ChannelType.GuildText,
                    parent: db.serverConfig.unbanCategory ? db.serverConfig.unbanCategory : null,
                    permissionOverwrites: permissionOverwrites,
                });

                const embedBan = new EmbedBuilder()
                    .setTitle('🔨 You received a Soft-Ban (Isolation)!')
                    .setColor('#E74C3C')
                    .setDescription(`Hello <@${targetUser.id}>,\nYou have been sanctioned with a soft-ban (isolation) on the server.\n\n**Reason:** ${reason}\n\nThis is the only channel you can see now. If you think this was a mistake or wish to apologize, please write your unban appeal below. A staff member will reply and evaluate the situation shortly.`)
                    .setTimestamp();

                const btnAccept = new ButtonBuilder().setCustomId(`btn_accept_unban_${targetUser.id}`).setLabel('Accept Unban').setStyle(ButtonStyle.Success);
                const btnDecline = new ButtonBuilder().setCustomId(`btn_decline_unban_${targetUser.id}`).setLabel('Close Request (Rejected)').setStyle(ButtonStyle.Danger);
                const row = new ActionRowBuilder().addComponents(btnAccept, btnDecline);

                await unbanChannel.send({ content: `<@${targetUser.id}>`, embeds: [embedBan], components: [row] });

                await interaction.reply({ content: `✅ Member **${targetUser.tag}** received a soft-ban and was isolated. Their roles were removed and saved. Appeal channel created: <#${unbanChannel.id}>` });
            } catch (err) {
                await interaction.reply({ content: `✅ Member received the soft-ban role, but an error occurred creating the unban appeal channel: ${err.message}`, ephemeral: true });
            }
        }

        if (interaction.commandName === 'unban') {
            const hasStaffRole = db.serverConfig.staffRole && interaction.member.roles.cache.has(db.serverConfig.staffRole);
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers) && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && !hasStaffRole) {
                return interaction.reply({ content: '❌ You don\'t have permissions!', ephemeral: true });
            }

            const targetUser = interaction.options.getUser('member');
            const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!targetMember) return interaction.reply({ content: '❌ Member was not found on the server.', ephemeral: true });

            if (db.serverConfig.softBanRole) {
                await targetMember.roles.remove(db.serverConfig.softBanRole).catch(() => {});
                
                if (db.savedRoles[targetUser.id]) {
                    await targetMember.roles.add(db.savedRoles[targetUser.id]).catch(() => {});
                    delete db.savedRoles[targetUser.id];
                }

                // DELETE FROM ANTI-BYPASS LIST
                if (db.softBannedUsers && db.softBannedUsers[targetUser.id]) {
                    delete db.softBannedUsers[targetUser.id];
                }
                saveDatabase();

                await sendModLog(interaction.guild, 'UNBAN (ISOLATION REMOVAL)', '#2ecc71', `<@${targetUser.id}> (${targetUser.tag})`, `<@${interaction.user.id}>`, 'No specific reason');

                await interaction.reply({ content: `✅ Member **${targetUser.tag}** had their soft-ban removed and their roles restored.` });
            } else {
                await interaction.reply({ content: '❌ The Soft-Ban role is not set in the panel, so I cannot remove the sanction automatically.', ephemeral: true });
            }
        }
    }

    if (interaction.isButton() && interaction.customId.startsWith('btn_accept_unban_')) {
        const hasStaffRole = db.serverConfig.staffRole && interaction.member.roles.cache.has(db.serverConfig.staffRole);
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers) && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && !hasStaffRole) {
            return interaction.reply({ content: '❌ You don\'t have permission to accept unban requests!', ephemeral: true });
        }
        
        const userId = interaction.customId.replace('btn_accept_unban_', '');
        const targetMember = await interaction.guild.members.fetch(userId).catch(() => null);

        if (targetMember && db.serverConfig.softBanRole) {
            await targetMember.roles.remove(db.serverConfig.softBanRole).catch(() => {});
            
            if (db.savedRoles[userId]) {
                await targetMember.roles.add(db.savedRoles[userId]).catch(() => {});
                delete db.savedRoles[userId];
            }
        }

        // DELETE FROM ANTI-BYPASS LIST ON ACCEPT
        if (db.softBannedUsers && db.softBannedUsers[userId]) {
            delete db.softBannedUsers[userId];
        }
        saveDatabase();

        await sendModLog(interaction.guild, 'UNBAN (REQUEST ACCEPTED)', '#2ecc71', `<@${userId}>`, `<@${interaction.user.id}>`, 'Unban request accepted from the isolation channel');

        await interaction.reply('✅ Unban request accepted! Isolation role removed and old roles restored. Channel will be deleted automatically in 5 seconds...');
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }

    if (interaction.isButton() && interaction.customId.startsWith('btn_decline_unban_')) {
        const hasStaffRole = db.serverConfig.staffRole && interaction.member.roles.cache.has(db.serverConfig.staffRole);
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers) && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && !hasStaffRole) {
            return interaction.reply({ content: '❌ You don\'t have permission to reject unban requests!', ephemeral: true });
        }
        
        const userId = interaction.customId.replace('btn_decline_unban_', '');
        await sendModLog(interaction.guild, 'UNBAN REJECTED', '#e74c3c', `<@${userId}>`, `<@${interaction.user.id}>`, 'The unban request was rejected.');

        await interaction.reply('❌ Unban request was rejected/closed. The user will remain isolated. Channel will be deleted automatically in 5 seconds...');
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }

    if (interaction.isButton() && interaction.customId.startsWith('role_btn_')) {
        const index = interaction.customId.split('_')[2];
        const roleData = db.roluri[index];
        
        if (!roleData || !roleData.id) return interaction.reply({ content: 'Error: This role no longer exists in the system.', ephemeral: true });

        const role = interaction.guild.roles.cache.get(roleData.id);
        if (!role) return interaction.reply({ content: 'Error: The role was deleted from Discord, check the ID in the panel.', ephemeral: true });

        try {
            if (interaction.member.roles.cache.has(role.id)) {
                await interaction.member.roles.remove(role);
                await interaction.reply({ content: `Removed your role **${role.name}**!`, ephemeral: true });
            } else {
                await interaction.member.roles.add(role);
                await interaction.reply({ content: `You received the role **${role.name}**!`, ephemeral: true });
            }
        } catch(e) {
            await interaction.reply({ content: 'Error: I do not have permission to give this role (Put the bot higher in the role list).', ephemeral: true });
        }
    }

    if (interaction.isButton() && interaction.customId === 'btn_create_ticket_classic') {
        await interaction.deferReply({ ephemeral: true });
        await createTicketChannel(interaction, `ticket-${interaction.user.username}`, `👋 **Hello!**\nPlease provide more details about why you opened this ticket. The Staff team will respond as soon as possible.`);
    }

    if (interaction.isButton() && interaction.customId === 'btn_create_ticket_advanced') {
        const embed = new EmbedBuilder()
            .setTitle('🎫 Choose ticket category')
            .setDescription('Please choose the correct section for your problem.\n\n🎮 **In-game issues:**\nYou must have your Discord account linked to the game using the `/link` command. *(You can find the connection code in the Launcher settings).*\n\n🚀 **Launcher issues:**\nThis section is strictly for installation or startup bugs.\n⚠️ **WARNING:** If you use this category for in-game issues, the ticket will be CLOSED IMMEDIATELY by staff!')
            .setColor('#f1c40f');

        const btnInGame = new ButtonBuilder().setCustomId('btn_ingame_ticket').setLabel('Report an in-game issue').setStyle(ButtonStyle.Primary).setEmoji('🎮');
        const btnLauncherIssue = new ButtonBuilder().setCustomId('btn_launcher_ticket').setLabel('Launcher Issues').setStyle(ButtonStyle.Danger).setEmoji('🚀');
        const btnReport = new ButtonBuilder().setCustomId('btn_report_ticket').setLabel('Report person').setStyle(ButtonStyle.Secondary).setEmoji('🚨');

        const row = new ActionRowBuilder().addComponents(btnInGame, btnLauncherIssue, btnReport);

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === 'btn_report_ticket') {
        await interaction.deferReply({ ephemeral: true });
        await createTicketChannel(interaction, `report-${interaction.user.username}`, `🚨 **Report a person**\n\nHello! Please provide the name of the person you want to report and describe the situation in detail (including evidence, if any). A staff member will review the report as soon as possible.`);
    }

    if (interaction.isButton() && interaction.customId === 'btn_ingame_ticket') {
        await interaction.deferReply({ ephemeral: true });
        try {
            const response = await fetch('http://144.76.98.184:5011/check-discord', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ discord_id: interaction.user.username, auth_key: 'EVOCRAFTSECURITYPASSWORD2026' })
            });
            const data = await response.json();

            let mcName = null;
            if (data.status === 'LINKED') {
                mcName = data.username;
            } else if (db.linkedAccounts[interaction.user.id]) {
                mcName = db.linkedAccounts[interaction.user.id];
            }

            if (mcName) {
                await createTicketChannel(interaction, `game-${mcName}`, `🎮 **In-game problem**\n👤 Player name: **${mcName}**\n\nHello! Please briefly describe the issue. A staff member will take over the ticket shortly.`);
            } else {
                await interaction.editReply({ content: '❌ **ACCESS DENIED!**\nYou do not have a linked account! To report an in-game issue, you must use the `/link <code>` command.\n\nThe code is generated from the EvoCraft Launcher settings.' });
            }
        } catch (err) {
            await interaction.editReply({ content: '❌ Database connection error. Please try again later.' });
        }
    }

    if (interaction.isButton() && interaction.customId === 'btn_launcher_ticket') {
        await interaction.deferReply({ ephemeral: true });
        await createTicketChannel(interaction, `launcher-${interaction.user.username}`, `🚀 **Launcher Problem**\n⚠️ **STAFF WARNING:** If the user reports in-game issues in this ticket, **CLOSE IT IMMEDIATELY!** (This category is only for technical issues with the launcher).\n\nHello! Please describe the problem or error you are getting in the Launcher.`);
    }

    if (interaction.isButton() && interaction.customId === 'btn_claim_ticket') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return interaction.reply({ content: '❌ Only staff members can claim tickets!', ephemeral: true });
        }
        
        const oldEmbed = interaction.message.embeds[0];
        const newEmbed = EmbedBuilder.from(oldEmbed)
            .setColor('#2ecc71')
            .addFields({ name: '🛠️ Ticket Claimed', value: `This ticket has been taken over by **${interaction.user.tag}**.` });
            
        await interaction.message.edit({ embeds: [newEmbed], components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_close_ticket').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)
        )] });
        
        await interaction.reply({ content: `✅ You have claimed this ticket! <@${interaction.user.id}> will take care of the problem.` });
    }

    if (interaction.isButton() && interaction.customId === 'btn_close_ticket') {
        const hasStaffRole = db.serverConfig.staffRole && interaction.member.roles.cache.has(db.serverConfig.staffRole);
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && !hasStaffRole) {
            return interaction.reply({ content: '❌ Only Administrators and Staff can close tickets!', ephemeral: true });
        }

        await interaction.reply('🔒 Ticket will close in 5 seconds. Generating HTML file...');
        
        try {
            const msgs = await interaction.channel.messages.fetch({ limit: 100 });
            let htmlMsgs = '';
            
            msgs.reverse().forEach(m => {
                if (m.content || m.embeds.length > 0) {
                    let content = m.content || '';
                    if (m.embeds.length > 0 && !m.content) {
                        content = `<div class="embed-content"><b>[Embed Content]</b><br/>${m.embeds[0].title || ''} - ${m.embeds[0].description || ''}</div>`;
                    }
                    let date = new Date(m.createdTimestamp).toLocaleString('en-US');
                    htmlMsgs += `
                        <div class="message">
                            <div class="author">${m.author.tag} <span class="time">${date}</span></div>
                            <div class="content">${content}</div>
                        </div>`;
                }
            });

            const ticketId = interaction.channel.name;

            const finalHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Transcript: ${ticketId}</title>
                <style>
                    body { background-color: #1e1f22; color: #dcddde; font-family: 'Segoe UI', sans-serif; padding: 40px; margin:0;}
                    .wrapper { max-width: 900px; margin: 0 auto; }
                    h1 { color: #2ecc71; border-bottom: 2px solid #2b2d31; padding-bottom: 15px; margin-bottom: 30px;}
                    .message { background: #2b2d31; margin-bottom: 15px; padding: 20px; border-radius: 8px; border-left: 4px solid #5865F2; box-shadow: 0 4px 6px rgba(0,0,0,0.1);}
                    .author { font-weight: bold; color: #2ecc71; margin-bottom: 8px; display: inline-block; font-size: 16px;}
                    .time { color: #72767d; font-size: 12px; margin-left: 10px; font-weight: normal;}
                    .content { line-height: 1.5; font-size: 15px; word-wrap: break-word;}
                    .embed-content { background: rgba(0,0,0,0.2); padding: 10px; border-radius: 5px; margin-top: 10px; border-left: 3px solid #f1c40f; }
                </style>
            </head>
            <body>
                <div class="wrapper">
                    <h1>📁 Ticket Archive: ${ticketId}</h1>
                    <div style="background: rgba(0,0,0,0.1); padding: 20px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.05);">
                        ${htmlMsgs}
                    </div>
                </div>
            </body>
            </html>`;

            fs.writeFileSync(path.join(TRANSCRIPTS_DIR, `${ticketId}.html`), finalHtml);

            if (db.serverConfig.transcriptsChannel) {
                const transChan = interaction.guild.channels.cache.get(db.serverConfig.transcriptsChannel);
                if (transChan) {
                    const embedTrans = new EmbedBuilder()
                        .setTitle('🔒 Closed Ticket Archive')
                        .setDescription(`Ticket **${ticketId}** was closed and archived by <@${interaction.user.id}>.\n\n📄 **[Open Web Transcript (Click Here)](http://localhost:3000/transcript/${ticketId})**`)
                        .setColor('#00d0ff')
                        .setTimestamp();
                    await transChan.send({ embeds: [embedTrans] });
                }
            } else if (db.serverConfig.staffChannel) {
                const staffChan = interaction.guild.channels.cache.get(db.serverConfig.staffChannel);
                if (staffChan) {
                    const embedTrans = new EmbedBuilder()
                        .setTitle('🔒 Closed Ticket Documentation')
                        .setDescription(`Ticket **${ticketId}** was archived as a physical file by <@${interaction.user.id}>.\n⚠️ You have not set the Transcripts Channel in the Web Panel.\n\n📄 **[Open Web Transcript](http://localhost:3000/transcript/${ticketId})**`)
                        .setColor('DarkRed')
                        .setTimestamp();
                    await staffChan.send({ embeds: [embedTrans] });
                }
            }

            setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
        } catch (err) {
            console.error(err);
        }
    }

    // --- MUTE/DEMUTE BUTTON PENTRU APLICAȚII (DM FLOW) ---
    if (interaction.isButton() && (interaction.customId === 'btn_form1' || interaction.customId === 'btn_form2')) {
        let isF1 = interaction.customId === 'btn_form1';
        let configForm = isF1 ? db.formulare.form1 : db.formulare.form2;

        if (activeInterviews.has(interaction.user.id)) {
            return interaction.reply({ content: '❌ You already have an application in progress in your direct messages!', ephemeral: true });
        }

        if (!configForm.questions || configForm.questions.length === 0) {
            return interaction.reply({ content: '❌ There are no questions set in the panel for this form.', ephemeral: true });
        }

        try {
            await interaction.user.send(`👋 **Hello!** You have started the application for **${configForm.titlu}**.\n\n**Question 1/${configForm.questions.length}:**\n${configForm.questions[0]}\n*(Write your answer directly here in the chat)*`);
            
            activeInterviews.set(interaction.user.id, {
                formTitle: configForm.titlu,
                questions: configForm.questions,
                currentIdx: 0,
                answers: [],
                tempAnswer: null,
                status: 'AWAITING_ANSWER'
            });

            await interaction.reply({ content: '✅ I have sent you a private message to start the application! Check your DM list.', ephemeral: true });
        } catch (error) {
            await interaction.reply({ content: '❌ I cannot send you private messages. Make sure you have the option enabled in *Settings -> Privacy & Safety*.', ephemeral: true });
        }
    }

    if (interaction.isButton() && (interaction.customId.startsWith('staff_accept_') || interaction.customId.startsWith('staff_reject_'))) {
        const isAccept = interaction.customId.startsWith('staff_accept_');
        const userId = interaction.customId.split('_')[2];
        const actionText = isAccept ? 'ACCEPTED' : 'REJECTED';

        const oldEmbed = interaction.message.embeds[0];
        const newEmbed = EmbedBuilder.from(oldEmbed)
            .setColor(isAccept ? 'Green' : 'Red')
            .setTitle(`${oldEmbed.title} -> ${actionText} by ${interaction.user.tag}`)
            .addFields({ name: 'Review Status', value: `Reviewed by <@${interaction.user.id}>` });

        await interaction.message.edit({ embeds: [newEmbed], components: [] });

        try {
            const member = await interaction.guild.members.fetch(userId);
            await member.send(`Hello! Your application for **${oldEmbed.title}** has been reviewed by staff and marked as: **${actionText}**.`);
        } catch (err) {}

        await interaction.reply({ content: `You marked the application as ${actionText}.`, ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);