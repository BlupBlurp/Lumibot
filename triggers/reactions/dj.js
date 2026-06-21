const { EmbedBuilder, AttachmentBuilder } = require("discord.js");

/**
 * @type {import('../../typings').TriggerCommand}
 */
module.exports = {
	data: {
		name: ["[dj]"],
	},
	execute(message, args) {
		const embed = new EmbedBuilder()
			.setAuthor({
				name: "Team Lumi",
			})
			.setTitle("DJ - Noun.")
			.setDescription(`Sadly, in Shattered Platinum, DJ is no more.`)
			.setImage(
				"https://i.imgur.com/IlZmlZN.png",
			)
			.setColor(0x000000);

		message.channel.send({ embeds: [embed] });
	},
};
