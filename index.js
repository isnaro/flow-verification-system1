const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const moment = require('moment-timezone'); // Add moment-timezone for date formatting
require('dotenv').config();
const keepAlive = require('./keep_alive'); // Import keep_alive.js

// Load the configuration file
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates // Added for voice state updates
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const prefix = config.prefix; // Prefix for commands

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    keepAlive(); // Call the keepAlive function
});

client.on('messageCreate', async message => {
    // Ignore messages from bots and non-command messages
    if (message.author.bot || !message.content.startsWith(prefix)) return;

    // Check if the user has one of the allowed roles
    if (!message.member.roles.cache.some(role => config.allowedRoles.includes(role.id))) {
        return;
    }

    // Check if the command is used in the allowed channel
    if (message.channel.id !== config.allowedChannelId) {
        return message.reply(`This command only works in <#${config.allowedChannelId}>.`);
    }

    const args = message.content.slice(prefix.length).trim().split(/, +| +/); // Split on comma+space or space
    const userId = args.shift();
    const user = await message.guild.members.fetch(userId).catch(() => null);

    if (!user) {
        return message.reply('User not found.');
    }

    // Check if the user has the "non-verified" role
    if (!user.roles.cache.has(config.nonVerifiedRoleId)) {
        return message.reply('This user is already verified.');
    }

    const age = parseInt(args.find(arg => !isNaN(arg)));
    let ageRole;
    if (age >= 15 && age <= 17) {
        ageRole = config.roles["15 - 17 YO"];
    } else if (age >= 18 && age <= 24) {
        ageRole = config.roles["18 - 24 YO"];
    } else if (age >= 25 && age <= 30) {
        ageRole = config.roles["25 - 30 YO"];
    }

    const otherRoles = args.filter(arg => isNaN(arg)).map(role => role.trim().toLowerCase());
    const rolesToAdd = otherRoles.map(role => config.roles[role]).filter(Boolean);

    if (ageRole) {
        rolesToAdd.push(ageRole);
    }

    // Always add the "Giveaways" and "Events" roles
    rolesToAdd.push(config.roles.Giveaways, config.roles.Events);

    try {
        await user.roles.remove(config.nonVerifiedRoleId);

        let assignedRolesMessage = 'No roles assigned';
        if (rolesToAdd.length) {
            await user.roles.add(rolesToAdd);
            assignedRolesMessage = `Assigned roles: ${rolesToAdd.map(roleId => message.guild.roles.cache.get(roleId).name).join(', ')}`;
        }

        const verificationDate = moment().tz('Africa/Algiers').format('YYYY-MM-DD HH:mm:ss'); // GMT+1
        const joinDate = moment(user.joinedAt).tz('Africa/Algiers').format('YYYY-MM-DD HH:mm:ss'); // GMT+1
        const accountCreationDate = moment(user.user.createdAt).tz('Africa/Algiers').format('YYYY-MM-DD HH:mm:ss'); // GMT+1

        const verificationEmbed = new EmbedBuilder()
            .setTitle('User Verified')
            .setColor('#00FF00')
            .setThumbnail(user.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'Verified User', value: `${user.user.tag} (${user.id})` },
                { name: 'Moderator', value: `${message.author.tag} (${message.author.id})` },
                { name: 'Verification Date', value: verificationDate },
                { name: 'Join Date', value: joinDate },
                { name: 'Account Creation Date', value: accountCreationDate },
                { name: 'Assigned Roles', value: assignedRolesMessage }
            )
            .setFooter({ text: `Verified by ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
            .setTimestamp();

        const logChannel = client.channels.cache.get(config.logChannelId);
        logChannel.send({ embeds: [verificationEmbed] });

        message.reply(`Successfully verified ${user.user.tag}. ${assignedRolesMessage}`);
    } catch (err) {
        console.error(err);
        message.reply('There was an error processing the verification.');
    }
});

// Voice state update event listener
client.on('voiceStateUpdate', async (oldState, newState) => {
    // Check if the user joined one of the verification voice channels
    if ((newState.channelId === config.verificationVcId || newState.channelId === config.verificationVcId2) 
        && oldState.channelId !== newState.channelId) {
        const member = newState.member;
        // Check if the user has the non-verified role
        if (member.roles.cache.has(config.nonVerifiedRoleId)) {
            const channelId = newState.channelId; // Get the ID of the channel the user joined
            const joinDate = moment(member.joinedAt).tz('Africa/Algiers').format('YYYY-MM-DD HH:mm:ss'); // GMT+1
            const accountCreationDate = moment(member.user.createdAt).tz('Africa/Algiers').format('YYYY-MM-DD HH:mm:ss'); // GMT+1
            const embed = new EmbedBuilder()
                .setTitle('User Needs Verification')
                .setColor('#FF0000')
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'User', value: `${member.user.tag} (${member.id})` },
                    { name: 'Join Date', value: joinDate },
                    { name: 'Account Creation Date', value: accountCreationDate },
                    { name: 'Action Required', value: `Join the voice channel <#${channelId}> to verify them.` }
                )
                .setFooter({ text: 'Verification Required', iconURL: member.user.displayAvatarURL({ dynamic: true }) })
                .setTimestamp();

            const notificationChannel = client.channels.cache.get(channelId); // Send the notification to the verification voice channel
            if (notificationChannel) {
                notificationChannel.send({ content: `<@&${config.adminRoleId}>`, embeds: [embed] });
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
