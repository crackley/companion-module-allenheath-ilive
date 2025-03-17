const { combineRgb } = require('@companion-module/base')

module.exports = {
	getFeedbacks(instance) {
		const channelTypes = [
			{ id: 'input', label: 'Input Channel', max: 64 },
			{ id: 'fx_send', label: 'FX Send', max: 8 },
			{ id: 'fx_return', label: 'FX Return', max: 8 },
			{ id: 'mix', label: 'Mix', max: 32 }
		]

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
						type: 'dropdown',
						label: 'Channel Type',
						id: 'channelType',
						default: 'input',
						choices: channelTypes.map(type => ({ id: type.id, label: type.label })),
					},
					{
						type: 'number',
						label: 'Channel Number',
						id: 'channel',
						min: 1,
						max: 64,
						default: 1,
						isVisible: (options) => {
							const type = channelTypes.find(t => t.id === options.channelType)
							return {
								max: type ? type.max : 64
							}
						},
					},
				],
				callback: (feedback) => {
					const channel = parseInt(feedback.options.channel)
					const channelType = feedback.options.channelType
					let muteState
					
					switch (channelType) {
						case 'fx_send':
							muteState = instance.channelStates.fxMute?.[channel]
							break
						case 'fx_return':
							muteState = instance.channelStates.fxReturnMute?.[channel]
							break
						case 'mix':
							muteState = instance.channelStates.mixMute?.[channel]
							break
						default: // input
							muteState = instance.channelStates.mute?.[channel]
					}
					
					return muteState === true
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
						type: 'dropdown',
						label: 'Channel Type',
						id: 'channelType',
						default: 'input',
						choices: channelTypes.map(type => ({ id: type.id, label: type.label })),
					},
					{
						type: 'number',
						label: 'Channel Number',
						id: 'channel',
						min: 1,
						max: 64,
						default: 1,
						isVisible: (options) => {
							const type = channelTypes.find(t => t.id === options.channelType)
							return {
								max: type ? type.max : 64
							}
						},
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
					const channelType = feedback.options.channelType
					const threshold = parseFloat(feedback.options.threshold)
					let level
					
					switch (channelType) {
						case 'fx_send':
							level = instance.channelStates.fxFader?.[channel]
							break
						case 'fx_return':
							level = instance.channelStates.fxReturnFader?.[channel]
							break
						case 'mix':
							level = instance.channelStates.mixFader?.[channel]
							break
						default: // input
							level = instance.channelStates.fader?.[channel]
					}
					
					level = level || -Infinity
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
