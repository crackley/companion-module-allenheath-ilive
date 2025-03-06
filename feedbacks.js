const { combineRgb } = require('@companion-module/base')

module.exports = {
	getFeedbacks(instance) {
		return {
			channelMute: {
				type: 'boolean',
				name: 'Channel Mute State',
				description: 'Change color based on channel mute state',
				defaultStyle: {
					bgcolor: combineRgb(255, 0, 0),
					color: combineRgb(255, 255, 255),
				},
				options: [
					{
						type: 'number',
						label: 'Channel',
						id: 'channel',
						min: 1,
						max: 64,
						default: 1,
					},
				],
				callback: (feedback) => {
					const channel = parseInt(feedback.options.channel)
					return instance.channelStates.mute[channel] === true
				},
			},
			faderLevel: {
				type: 'boolean',
				name: 'Fader Level Above Threshold',
				description: 'Change color if fader level is above threshold',
				defaultStyle: {
					bgcolor: combineRgb(0, 255, 0),
					color: combineRgb(0, 0, 0),
				},
				options: [
					{
						type: 'number',
						label: 'Channel',
						id: 'channel',
						min: 1,
						max: 64,
						default: 1,
					},
					{
						type: 'number',
						label: 'Threshold (dB)',
						id: 'threshold',
						min: -90,
						max: 10,
						default: 0,
					},
				],
				callback: (feedback) => {
					const channel = parseInt(feedback.options.channel)
					const threshold = parseFloat(feedback.options.threshold)
					const level = instance.channelStates.fader[channel] || -Infinity
					
					// Convert raw level (0-1) to dB
					const dbLevel = level === 0 ? -90 : (level * 100) - 90
					return dbLevel >= threshold
				},
			},
			currentScene: {
				type: 'boolean',
				name: 'Current Scene',
				description: 'Change color when specific scene is active',
				defaultStyle: {
					bgcolor: combineRgb(0, 128, 255),
					color: combineRgb(255, 255, 255),
				},
				options: [
					{
						type: 'number',
						label: 'Scene Number',
						id: 'scene',
						min: 1,
						max: 250,
						default: 1,
					},
				],
				callback: (feedback) => {
					const scene = parseInt(feedback.options.scene)
					return instance.currentScene === scene
				},
			},
		}
	},
}
