module.exports = {
	getActions(instance) {
		const channelTypes = [
			{ id: 'input', label: 'Input Channel', max: 64, offset: 0x20 },
			{ id: 'fx_send', label: 'FX Send', max: 8, offset: 0x00 },
			{ id: 'fx_return', label: 'FX Return', max: 8, offset: 0x08 },
			{ id: 'mix', label: 'Mix', max: 32, offset: 0x60 },
			{ id: 'dca', label: 'DCA', max: 16, offset: 0x10 }
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
				},
			},
			muteCh: {
				name: 'Mute Channel',
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
						type: 'dropdown',
						label: 'State',
						id: 'state',
						choices: [
							{ id: '1', label: 'Mute' },
							{ id: '0', label: 'Unmute' },
						],
						default: '1',
					},
				],
				callback: async (action) => {
					const channelType = action.options.channelType
					const channel = parseInt(action.options.channel)
					const state = action.options.state
					
					const type = channelTypes.find(t => t.id === channelType)
					if (!type) return
					
					// Calculate the note number using the channel type's offset
					const noteNumber = type.offset + (channel - 1)
					
					// Send MIDI command for mute: 90 CH 7F CH 00
					// Send MIDI command for unmute: 90 CH 3F CH 00
					// Note: Console accepts 40-7F for mute, 01-3F for unmute
					// We use 7F and 3F as our standard values
					const midiCommand = [
						0x90,
						noteNumber,
						state === '1' ? 0x7F : 0x3F,
						noteNumber,
						0x00
					]
					
					instance.sendCommand('MUTE', Buffer.from(midiCommand))
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
