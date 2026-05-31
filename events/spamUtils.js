const { GuildConfig } = require("../keys.js");

const spamTracker = new Map();
const channelBurstTracker = new Map();

const SPAM_THRESHOLD = 2; // Number of spam messages triggering kick.
const SPAM_TIMEFRAME = 60000; // Timeframe in milliseconds.
const CHANNEL_BURST_REQUIRED_CHANNELS = 3; // Number of distinct channels required to trigger.
const CHANNEL_BURST_TIMEFRAME = 10000; // Timeframe in milliseconds.
const CHANNEL_BURST_DELETE_WINDOW = "60"; // Delete messages from the user in the last minute.

const ACCOUNT_COMPROMISED_MESSAGE = `Hi! Your account appears to have been compromised/hacked. You may have clicked a scam link, downloaded suspicious software, or scanned a QR code which gave a hacker access to your account. Your account was spamming our community with infectious links and we had no other choice than to remove you from the Team Luminescent server until your account is secure again.\n\n# Please do the following:\n1. Go to :wrench: Settings -> Devices and sign out from any suspicious location you do not recognize.\n2. Change your password. This will reset your user token.\n3. Go to Authorized Apps and remove any app which has the function "Join Servers For You".\n4. Make sure your email address was not changed to one you do not recognize.\n5. If you can, secure your account with 2FA. This can be done via the My Account setting. You would need a PC & mobile device for this. You'll need an Authenticator app like Google Authenticator or Authy. MAKE A BACKUP OF YOUR BACKUP CODES in case you lose your phone or access to the Authenticator.\n\nOnce you have secured your account, you are free to join back!`;

async function getGuildConfig(guildId) {
	if (!guildId) {
		return null;
	}

	try {
		const queryOrDoc = GuildConfig.findOne({ guildId });

		if (!queryOrDoc) {
			return null;
		}

		if (typeof queryOrDoc.cache === "function") {
			const cachedQuery = queryOrDoc.cache("1 hour");
			if (typeof cachedQuery.exec === "function") {
				return await cachedQuery.exec();
			}
			return await cachedQuery;
		}

		if (typeof queryOrDoc.exec === "function") {
			return await queryOrDoc.exec();
		}

		return await queryOrDoc;
	} catch (error) {
		console.error(`Error fetching guild config:`, error);
		return null;
	}
}

function hasWhitelistedRole(message, guildConfig) {
	if (!guildConfig || !message?.member?.roles?.cache) {
		return false;
	}

	for (const roleId of guildConfig.whitelistedRoles || []) {
		if (message.member.roles.cache.has(roleId)) {
			return true;
		}
	}

	return false;
}

async function removeUserForSpam(message, deleteMessageSeconds, reason) {
	const user = message.author;
	const member = message.member;

	try {
		await user.send({
			content: ACCOUNT_COMPROMISED_MESSAGE,
		});
		await member.ban({
			deleteMessageSeconds,
			reason,
		});

		await message.guild.members.unban(user);
	} catch (error) {
		console.error("Failed to kick user:", error);
	}
}

function recordChannelBurstEvent({ userId, channelId, timestamp = Date.now() }) {
	if (!userId || !channelId) {
		return {
			triggered: false,
			distinctChannelCount: 0,
		};
	}

	const events = channelBurstTracker.get(userId) || [];
	const recentEvents = events.filter(
		event => timestamp - event.timestamp < CHANNEL_BURST_TIMEFRAME,
	);

	recentEvents.push({
		channelId,
		timestamp,
	});

	channelBurstTracker.set(userId, recentEvents);

	const distinctChannelCount = new Set(
		recentEvents.map(event => event.channelId),
	).size;

	return {
		triggered: distinctChannelCount >= CHANNEL_BURST_REQUIRED_CHANNELS,
		distinctChannelCount,
	};
}

async function containsSpam(message) {
	const { guild, content, member } = message;
	if (!guild || !content || !member) {
		return false;
	}

	const guildConfig = await getGuildConfig(guild.id);

	if (!guildConfig || hasWhitelistedRole(message, guildConfig)) {
		return false;
	}

	for (const phrase of guildConfig.blacklistedPhrases || []) {
		if (content.includes(phrase)) {
			return true;
		}
	}

	return false;
}

async function handleChannelBurstSpam(message) {
	const { guild, member, author, channel } = message;
	if (!guild || !member || !author || !channel || author.bot) {
		return false;
	}

	// Burst detection is only applied to messages containing attachments.
	if (!message.attachments || message.attachments.size === 0) {
		return false;
	}

	const guildConfig = await getGuildConfig(guild.id);

	if (hasWhitelistedRole(message, guildConfig)) {
		return false;
	}

	const { triggered } = recordChannelBurstEvent({
		userId: author.id,
		channelId: channel.id,
	});

	if (!triggered) {
		return false;
	}

	await removeUserForSpam(
		message,
		CHANNEL_BURST_DELETE_WINDOW,
		"Rapid multi-channel spam",
	);
	channelBurstTracker.delete(author.id);

	return true;
}

async function handleSpam(message) {
	const userId = message.author.id;
	const currentTime = Date.now();

	if (spamTracker.has(userId)) {
		const { count, timestamp } = spamTracker.get(userId);

		// Second instance of spam within the timeframe
		if (count >= SPAM_THRESHOLD && currentTime - timestamp < SPAM_TIMEFRAME) {
			await removeUserForSpam(message, "86400", "Repeated spamming");
			spamTracker.delete(userId);
			return;
		}
	}

	// First instance of spam within the timeframe
	try {
		await message.delete();
	} catch (error) {
		console.error("Failed to delete message:", error);
	}
	spamTracker.set(userId, {
		count: (spamTracker.get(userId)?.count || 0) + 1,
		timestamp: currentTime,
	});
}

function clearSpamTrackers() {
	spamTracker.clear();
	channelBurstTracker.clear();
}

module.exports = {
	containsSpam,
	handleSpam,
	handleChannelBurstSpam,
	recordChannelBurstEvent,
	clearSpamTrackers,
};
