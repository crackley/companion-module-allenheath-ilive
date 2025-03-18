module.exports = {
	getActions(instance) {
		const channelTypes = [
			{ id: 'input', label: 'Input Channel', max: 64, offset: 0x20, stateKey: 'fader', varPrefix: 'ch' },
			{ id: 'fx_send', label: 'FX Send', max: 8, offset: 0x00, stateKey: 'fxFader', varPrefix: 'fx_send' },
			{ id: 'fx_return', label: 'FX Return', max: 8, offset: 0x08, stateKey: 'fxReturnFader', varPrefix: 'fx_return' },
			{ id: 'mix', label: 'Mix', max: 32, offset: 0x60, stateKey: 'mixFader', varPrefix: 'mix' },
			{ id: 'dca', label: 'DCA', max: 16, offset: 0x10, stateKey: 'dcaFader', varPrefix: 'dca' }
		]

		return {
			faderLevel: {
				name: 'Fader Level',
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
						label: 'Level (dB)',
						id: 'level',
						min: -54,  // Minimum value when MIDI is 0
						max: 10,   // Maximum value when MIDI is 127
						default: 0,
					},
				],
				callback: async (action) => {
					const channelType = action.options.channelType
					const channel = parseInt(action.options.channel)
					const level = parseFloat(action.options.level)
					
					const type = channelTypes.find(t => t.id === channelType)
					if (!type) return
					
					// Calculate the note number using the channel type's offset
					const noteNumber = type.offset + (channel - 1)
					
					// Convert dB to MIDI value using formula: midi = ((dB + 54) * 127) / 64
					let midiLevel = Math.round(((level + 54) * 127) / 64)
					
					// Clamp to valid MIDI range
					midiLevel = Math.max(0, Math.min(127, midiLevel))
					
					// Send MIDI command: B0 63 CH 62 17 06 LV
					const midiCommand = [
						0xB0,
						0x63,
						noteNumber,
						0x62,
						0x17,
						0x06,
						midiLevel
					]
					
					instance.sendCommand('FADER', Buffer.from(midiCommand))

					// Update state and variable
					instance.channelStates[type.stateKey][channel] = level
					instance.setVariableValues({
						[`${type.varPrefix}_${channel}_fader`]: level.toFixed(1)
					})
				},
			},
			muteCh: {
				name: 'Channel Mute',
				description: 'Mute or unmute a channel',
				options: [
					{
						type: 'dropdown',
						label: 'Channel Type',
						id: 'type',
						default: 'input',
						choices: channelTypes.map((type) => ({ id: type.id, label: type.label })),
					},
					{
						type: 'number',
						label: 'Channel',
						id: 'channel',
						min: 1,
						max: 64,
						default: 1,
						isVisible: (options) => {
							const type = channelTypes.find((t) => t.id === options.type)
							return type ? true : false
						},
						range: (options) => {
							const type = channelTypes.find((t) => t.id === options.type)
							return type ? { min: 1, max: type.max } : { min: 1, max: 64 }
						},
					},
					{
						type: 'dropdown',
						label: 'Mute/Unmute',
						id: 'mute',
						default: true,
						choices: [
							{ id: true, label: 'Mute' },
							{ id: false, label: 'Unmute' },
						],
					},
				],
				callback: async (action) => {
					const type = channelTypes.find((t) => t.id === action.options.type)
					if (!type) return

					const channel = action.options.channel
					if (channel < 1 || channel > type.max) return

					const mute = action.options.mute
					const noteNumber = type.offset + (channel - 1)
					const velocity = mute ? 0x7F : 0x3F

					const midiCommand = [0x90, noteNumber, velocity, noteNumber, 0x00]
					instance.sendCommand('MUTE', Buffer.from(midiCommand))

					// Update state and trigger feedback
					let stateKey
					switch (type.id) {
						case 'input':
							stateKey = 'mute'
							break
						case 'fx_send':
							stateKey = 'fxMute'
							break
						case 'fx_return':
							stateKey = 'fxReturnMute'
							break
						case 'mix':
							stateKey = 'mixMute'
							break
						case 'dca':
							stateKey = 'dcaMute'
							break
					}
					if (stateKey) {
						instance.channelStates[stateKey][channel] = mute
						instance.checkFeedbacks('channelMute')
					}
				},
			},
			toggleMute: {
				name: 'Toggle Channel Mute',
				description: 'Toggle mute state of a channel',
				options: [
					{
						type: 'dropdown',
						label: 'Channel Type',
						id: 'type',
						default: 'input',
						choices: channelTypes.map((type) => ({ id: type.id, label: type.label })),
					},
					{
						type: 'number',
						label: 'Channel',
						id: 'channel',
						min: 1,
						max: 64,
						default: 1,
						isVisible: (options) => {
							const type = channelTypes.find((t) => t.id === options.type)
							return type ? true : false
						},
						range: (options) => {
							const type = channelTypes.find((t) => t.id === options.type)
							return type ? { min: 1, max: type.max } : { min: 1, max: 64 }
						},
					},
				],
				callback: async (action) => {
					const type = channelTypes.find((t) => t.id === action.options.type)
					if (!type) return

					const channel = action.options.channel
					if (channel < 1 || channel > type.max) return

					// Get current mute state
					let stateKey
					switch (type.id) {
						case 'input':
							stateKey = 'mute'
							break
						case 'fx_send':
							stateKey = 'fxMute'
							break
						case 'fx_return':
							stateKey = 'fxReturnMute'
							break
						case 'mix':
							stateKey = 'mixMute'
							break
						case 'dca':
							stateKey = 'dcaMute'
							break
					}
					if (!stateKey) return

					// Toggle the state
					const currentState = instance.channelStates[stateKey][channel] || false
					const newState = !currentState

					const noteNumber = type.offset + (channel - 1)
					const velocity = newState ? 0x7F : 0x3F

					const midiCommand = [0x90, noteNumber, velocity, noteNumber, 0x00]
					instance.sendCommand('MUTE', Buffer.from(midiCommand))

					// Update state and trigger feedback
					instance.channelStates[stateKey][channel] = newState
					instance.checkFeedbacks('channelMute')
				},
			},
			adjustFader: {
				name: 'Adjust Fader Level',
				description: 'Increment or decrement a fader level by a specified amount',
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
						label: 'Adjustment Amount (dB)',
						id: 'adjustment',
						min: -64,
						max: 64,
						default: 1,
						required: true,
					},
				],
				callback: async (action) => {
					const channelType = action.options.channelType
					const channel = parseInt(action.options.channel)
					const adjustment = parseFloat(action.options.adjustment)
					
					const type = channelTypes.find(t => t.id === channelType)
					if (!type) return
					
					// Get current level
					const currentLevel = instance.channelStates[type.stateKey][channel] || 0
					
					// Calculate new level
					let newLevel = currentLevel + adjustment
					
					// Clamp to valid range (-54 to +10 dB)
					newLevel = Math.max(-54, Math.min(10, newLevel))
					
					// Calculate the note number using the channel type's offset
					const noteNumber = type.offset + (channel - 1)
					
					// Convert dB to MIDI value using formula: midi = ((dB + 54) * 127) / 64
					let midiLevel = Math.round(((newLevel + 54) * 127) / 64)
					
					// Clamp to valid MIDI range
					midiLevel = Math.max(0, Math.min(127, midiLevel))
					
					// Send MIDI command: B0 63 CH 62 17 06 LV
					const midiCommand = [
						0xB0,
						0x63,
						noteNumber,
						0x62,
						0x17,
						0x06,
						midiLevel
					]
					
					instance.sendCommand('FADER', Buffer.from(midiCommand))

					// Update state and variable
					instance.channelStates[type.stateKey][channel] = newLevel
					instance.setVariableValues({
						[`${type.varPrefix}_${channel}_fader`]: newLevel.toFixed(1)
					})
				},
			},
			recallScene: {
				name: 'Recall Scene',
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
				callback: async (action) => {
					const scene = parseInt(action.options.scene)
					
					// For scenes 1-128: B0 00 00 C0 SS
					// For scenes 129-250: B0 00 01 C0 SS
					let midiCommand
					
					if (scene <= 128) {
						// Scenes 1-128 map directly to 00-7F
						midiCommand = [
							0xB0,
							0x00,
							0x00,
							0xC0,
							scene - 1 // Convert 1-based scene number to 0-based MIDI value
						]
					} else {
						// Scenes 129-250 map to 00-78 with bank 01
						midiCommand = [
							0xB0,
							0x00,
							0x01,
							0xC0,
							scene - 129 // Convert to 0-based value for second bank
						]
					}
					
					instance.sendCommand('SCENE', Buffer.from(midiCommand))
				},
			},
			pollNames: {
				name: 'Poll Channel Names',
				description: 'Request all channel names from the mixer. Useful when automatic polling is disabled.',
				options: [],
				callback: async (action) => {
					instance.pollChannelNames()
				},
			},
		}
	},
}
