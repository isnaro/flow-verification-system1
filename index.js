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
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const prefix = config.prefix; // Prefix for commands
const allowedChannelId = '1201153567491358860'; // ID of the channel where the command is allowed

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
    if (message.channel.id !== allowedChannelId) {
        return message.reply(`This command only works in <#${allowedChannelId}>.`);
    }

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const userId = args.shift();
    const user = await message.guild.members.fetch(userId).catch(() => null);

    if (!user) {
        return message.reply('User not found.');
    }

    // Check if the user has the "non-verified" role
    if (!user.roles.cache.has(config.nonVerifiedRoleId)) {
        return message.reply('This user is already verified.');
    }

    const roleArgs = args.join(' ').split(',').map(role => role.trim());
    const rolesToAdd = roleArgs.map(role => config.roles[role]).filter(Boolean);

    try {
        await user.roles.remove(config.nonVerifiedRoleId);

        let assignedRolesMessage = 'No roles assigned';
        if (rolesToAdd.length) {
            await user.roles.add(rolesToAdd);
            assignedRolesMessage = `Assigned roles: ${roleArgs.join(', ')}`;
        }

        const verificationDate = moment().tz('Africa/Algiers').format('YYYY-MM-DD HH:mm:ss'); // GMT+1
        const joinDate = moment(user.joinedAt).tz('Africa/Algiers').format('YYYY-MM-DD HH:mm:ss'); // GMT+1

        const verificationEmbed = new EmbedBuilder()
            .setTitle('User Verified')
            .setColor('#00FF00')
            .setThumbnail(user.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'Verified User', value: `${user.user.tag} (${user.id})` },
                { name: 'Moderator', value: `${message.author.tag} (${message.author.id})` },
                { name: 'Verification Date', value: verificationDate },
                { name: 'Join Date', value: joinDate },
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

client.login(process.env.DISCORD_TOKEN);
