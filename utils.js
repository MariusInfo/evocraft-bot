const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const { db, saveDatabase } = require('./database');

// --- MINECRAFT LIVE STATUS FUNCTION (SECTIONS) ---
async function updateMCStatus(client) {
    if (!db.serverConfig.mcStatusChannel) return; 
    try {
        const channel = await client.channels.fetch(db.serverConfig.mcStatusChannel).catch(() => null);
        if (!channel) return;

        const resMain = await fetch('https://api.mcsrvstat.us/3/play.evocraft.ro');
        const dataMain = await resMain.json();

        const resSurv = await fetch('https://api.mcsrvstat.us/3/144.76.98.184:5000');
        const dataSurv = await resSurv.json();

        const resCreative = await fetch('https://api.mcsrvstat.us/3/144.76.98.184:5002');
        const dataCreative = await resCreative.json();

        let embed = new EmbedBuilder()
            .setAuthor({ name: 'EvoCraft - Live Server Status', iconURL: client.user.displayAvatarURL() })
            .setFooter({ text: 'Advanced monitoring system • Automatically updated' })
            .setTimestamp();

        if (dataMain.online) {
            let motdCurat = dataMain.motd.clean.join('\n');
            
            if (dataMain.players.online > db.stats.maxMcPlayersRecord) {
                db.stats.maxMcPlayersRecord = dataMain.players.online;
                saveDatabase();
            }
            
            let survPlayerList = 'No explorers online at the moment.';
            if (dataSurv.online && dataSurv.players && dataSurv.players.list && dataSurv.players.list.length > 0) {
                survPlayerList = dataSurv.players.list.map(p => `\`${p.name}\``).join('  '); 
                if (survPlayerList.length > 1000) survPlayerList = survPlayerList.substring(0, 1000) + '... (list is too long)';
            }

            embed.setColor('#2ecc71')
                 .setThumbnail(`https://api.mcsrvstat.us/icon/play.evocraft.ro`)
                 .setDescription(`**${motdCurat}**\n\n🌍 **Connect now:** \`play.evocraft.ro\``)
                 .addFields(
                     { name: '🟢 Network Status', value: 'Online', inline: true },
                     { name: '⚙️ Version', value: '1.20.1', inline: true },
                     
                     { name: '\u200B', value: '⚔️ **SURVIVAL SECTION**', inline: false },
                     { name: 'Status', value: dataSurv.online ? '🟢 Online' : '🔴 Offline', inline: true },
                     { name: 'Players', value: dataSurv.online ? `${dataSurv.players.online} / ${dataSurv.players.max}` : '0 / 0', inline: true },

                     
                     { name: '\u200B', value: '🎨 **CREATIVE SECTION**', inline: false },
                     { name: 'Status', value: dataCreative.online ? '🟢 Online' : '🔴 Offline', inline: true },
                     { name: 'Players', value: dataCreative.online ? `${dataCreative.players.online} / ${dataCreative.players.max}` : '0 / 0', inline: true },

                     { name: '\u200B', value: '\u200B', inline: false },
                     { name: '🏆 Concurrent Players Record', value: `**${db.stats.maxMcPlayersRecord}** players`, inline: false }
                 );
        } else {
            embed.setColor('#e74c3c')
                 .setThumbnail(`https://api.mcsrvstat.us/icon/play.evocraft.ro`)
                 .setDescription(`**EvoCraft Network is currently OFFLINE or in full maintenance.**\n\n🌍 **IP:** \`play.evocraft.ro\``)
                 .addFields(
                     { name: '🔴 Network Status', value: 'Offline', inline: true },
                     { name: '👥 Players', value: '0 / 0', inline: true },
                     { name: '⚙️ Version', value: '1.20.1', inline: true }
                 );
        }

        if (db.serverConfig.mcStatusMessageId) {
            try {
                const msg = await channel.messages.fetch(db.serverConfig.mcStatusMessageId);
                await msg.edit({ embeds: [embed] });
                return; 
            } catch (e) {
            }
        }

        const fetchedMsgs = await channel.messages.fetch({ limit: 50 });
        await channel.bulkDelete(fetchedMsgs).catch(() => {}); 
        const newMsg = await channel.send({ embeds: [embed] }); 
        
        db.serverConfig.mcStatusMessageId = newMsg.id; 
        saveDatabase();

    } catch(e) { console.log('Could not update MC status.'); }
}

// --- FUNCTION FOR MODERATION LOGS ---
async function sendModLog(guild, actionName, color, target, staff, reason, extraInfo = '') {
    if (!db.serverConfig.modLogsChannel) return;
    const logChannel = guild.channels.cache.get(db.serverConfig.modLogsChannel);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
        .setTitle(`⚖️ Moderation Logs | ${actionName}`)
        .setColor(color)
        .addFields(
            { name: '👤 Sanctioned User', value: target, inline: true },
            { name: '🛡️ Given by', value: staff, inline: true },
            { name: '📝 Reason', value: reason, inline: false }
        )
        .setTimestamp();
    
    if (extraInfo) {
        embed.addFields({ name: '⏱️ Details', value: extraInfo, inline: false });
    }

    await logChannel.send({ embeds: [embed] }).catch(() => {});
}

// FUNCTION FOR ACTUALLY CREATING THE TICKET
async function createTicketChannel(interaction, channelName, extraInfo) {
    try {
        let permissionOverwrites = [
            { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
        ];

        if (db.serverConfig.staffRole) {
            permissionOverwrites.push({
                id: db.serverConfig.staffRole,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
            });
        }

        const channel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: db.serverConfig.ticketCategory ? db.serverConfig.ticketCategory : null,
            permissionOverwrites: permissionOverwrites,
        });

        const embedTicket = new EmbedBuilder()
            .setTitle(`🎫 Ticket opened`)
            .setDescription(`${extraInfo}`)
            .setColor('#f1c40f')
            .setTimestamp();

        const btnClose = new ButtonBuilder().setCustomId('btn_close_ticket').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger);
        const btnClaim = new ButtonBuilder().setCustomId('btn_claim_ticket').setLabel('Claim').setEmoji('✋').setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(btnClose, btnClaim);

        let pingMsg = `<@${interaction.user.id}>`;
        if (db.serverConfig.staffRole) pingMsg += ` <@&${db.serverConfig.staffRole}>`; 

        await channel.send({ content: pingMsg, embeds: [embedTicket], components: [row] });
        
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: `✅ Your ticket has been created: <#${channel.id}>`, embeds: [], components: [] });
        } else {
            await interaction.reply({ content: `✅ Your ticket has been created: <#${channel.id}>`, ephemeral: true });
        }
    } catch (error) {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: '❌ Error during creation! Check if you have set the category on the site.' });
        } else {
            await interaction.reply({ content: '❌ Error during creation! Check if you have set the category on the site.', ephemeral: true });
        }
    }
}

module.exports = { updateMCStatus, sendModLog, createTicketChannel };