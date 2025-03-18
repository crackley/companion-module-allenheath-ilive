const { InstanceBase, Regex, runEntrypoint, InstanceStatus } = require('@companion-module/base')
const { getActions } = require('./actions')
const { getFeedbacks } = require('./feedbacks')
const { getVariables } = require('./variables')
const { upgradeScripts } = require('./upgrades')
const net = require('net')

class iLiveInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		this.socket = null
		this.connected = false
		this.commandQueue = []
		this.processingQueue = false
		this.channelStates = {
			name: {},
			fxSendName: {},
			fxReturnName: {},
			mixName: {},
			dcaName: {},
			mute: {},
			fxMute: {},
			fxReturnMute: {},
			mixMute: {},
			dcaMute: {},
			fader: {},
			fxFader: {},
			fxReturnFader: {},
			mixFader: {},
			dcaFader: {},
		}
		this.receivedData = Buffer.alloc(0)
		this.pollTimer = null
		
		// Initialize channel states
		for (let i = 1; i <= 64; i++) {
			this.channelStates.mute[i] = false
			this.channelStates.name[i] = ''
			this.channelStates.fader[i] = 0
		}
		for (let i = 1; i <= 8; i++) {
			this.channelStates.fxMute[i] = false
			this.channelStates.fxReturnMute[i] = false
			this.channelStates.fxSendName[i] = ''
			this.channelStates.fxReturnName[i] = ''
			this.channelStates.fxFader[i] = 0
			this.channelStates.fxReturnFader[i] = 0
		}
		for (let i = 1; i <= 32; i++) {
			this.channelStates.mixMute[i] = false
			this.channelStates.mixName[i] = ''
			this.channelStates.mixFader[i] = 0
		}
		for (let i = 1; i <= 16; i++) {
			this.channelStates.dcaMute[i] = false
			this.channelStates.dcaName[i] = ''
			this.channelStates.dcaFader[i] = 0
		}
	}

	async init(config) {
		this.config = config
		this.updateStatus(InstanceStatus.Connecting)

		this.initConnection()
		this.initActions()
		this.initFeedbacks()
		this.initVariables()
		this.initPolling()
	}

	async destroy() {
		if (this.socket) {
			this.socket.destroy()
		}
		this.stopPolling()
	}

	async configUpdated(config) {
		const needReconnect = this.config.host !== config.host
		const pollIntervalChanged = this.config.pollInterval !== config.pollInterval
		
		this.config = config

		if (needReconnect) {
			this.initConnection()
		}
		
		if (pollIntervalChanged) {
			this.initPolling()
		}
	}

	getConfigFields() {
		return [
			{
				type: 'textinput',
				id: 'host',
				label: 'Target IP',
				width: 8,
				regex: Regex.IP,
			},
			{
				type: 'number',
				id: 'pollInterval',
				label: 'Poll Interval (seconds)',
				tooltip: 'How often to poll for input channel names (0 to disable)',
				width: 4,
				default: 1,
				min: 0,
				max: 60,
			},
			{
				type: 'number',
				id: 'maxChannel',
				label: 'Max Input Channel to Poll',
				tooltip: 'Highest input channel number to poll for names',
				width: 4,
				default: 32,
				min: 1,
				max: 64,
			},
		]
	}

	initConnection() {
		if (this.socket) {
			this.socket.destroy()
			delete this.socket
		}

		if (!this.config.host) {
			this.updateStatus(InstanceStatus.BadConfig, 'No target IP configured')
			return
		}

		this.socket = new net.Socket()
		
		this.socket.on('connect', () => {
			this.connected = true
			this.updateStatus(InstanceStatus.Ok)
			this.initPolling()
		})
		
		this.socket.on('error', (err) => {
			this.connected = false
			this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
			
			// Clear all states when disconnected
			for (let i = 1; i <= 64; i++) {
				this.channelStates.mute[i] = false
				this.channelStates.name[i] = ''
			}
			for (let i = 1; i <= 8; i++) {
				this.channelStates.fxMute[i] = false
				this.channelStates.fxReturnMute[i] = false
				this.channelStates.fxSendName[i] = ''
				this.channelStates.fxReturnName[i] = ''
			}
			for (let i = 1; i <= 32; i++) {
				this.channelStates.mixMute[i] = false
				this.channelStates.mixName[i] = ''
			}
			for (let i = 1; i <= 16; i++) {
				this.channelStates.dcaMute[i] = false
				this.channelStates.dcaName[i] = ''
			}
			this.checkFeedbacks('channelMute')
			this.checkFeedbacks('channelName')
		})
		
		this.socket.on('close', () => {
			this.connected = false
			this.updateStatus(InstanceStatus.Disconnected)
			
			// Clear all states when disconnected
			for (let i = 1; i <= 64; i++) {
				this.channelStates.mute[i] = false
				this.channelStates.name[i] = ''
			}
			for (let i = 1; i <= 8; i++) {
				this.channelStates.fxMute[i] = false
				this.channelStates.fxReturnMute[i] = false
				this.channelStates.fxSendName[i] = ''
				this.channelStates.fxReturnName[i] = ''
			}
			for (let i = 1; i <= 32; i++) {
				this.channelStates.mixMute[i] = false
				this.channelStates.mixName[i] = ''
			}
			for (let i = 1; i <= 16; i++) {
				this.channelStates.dcaMute[i] = false
				this.channelStates.dcaName[i] = ''
			}
			this.checkFeedbacks('channelMute')
			this.checkFeedbacks('channelName')
			
			// Try to reconnect after 5 seconds
			setTimeout(() => {
				if (!this.socket) return
				this.socket.connect(51325, this.config.host)
			}, 5000)
		})
		
		this.socket.on('data', (data) => {
			this.processData(data)
		})
		
		this.socket.connect(51325, this.config.host)
	}

	initPolling() {
		this.stopPolling()
		
		if (this.config.pollInterval > 0) {
			this.pollTimer = setInterval(() => {
				if (this.connected) {
					this.pollChannelNames()
				}
			}, this.config.pollInterval * 1000)  // Convert seconds to milliseconds
			
			// Do an immediate poll if connected
			if (this.connected) {
				this.pollChannelNames()
			}
		}
	}

	stopPolling() {
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
			this.pollTimer = null
		}
	}

	pollChannelNames() {
		if (!this.connected) return
		
		// Poll input channel names
		for (let i = 1; i <= 64; i++) {
			const noteNumber = 0x20 + (i - 1)
			const midiCommand = [0xF0, 0x00, 0x00, 0x1A, 0x50, 0x10, 0x01, 0x00, 0x00, 0x01, noteNumber, 0xF7]
			this.sendCommand('NAME', Buffer.from(midiCommand))
		}
		
		// Poll FX Send names
		for (let i = 1; i <= 8; i++) {
			const noteNumber = 0x00 + (i - 1)
			const midiCommand = [0xF0, 0x00, 0x00, 0x1A, 0x50, 0x10, 0x01, 0x00, 0x00, 0x01, noteNumber, 0xF7]
			this.sendCommand('NAME', Buffer.from(midiCommand))
		}
		
		// Poll FX Return names
		for (let i = 1; i <= 8; i++) {
			const noteNumber = 0x08 + (i - 1)
			const midiCommand = [0xF0, 0x00, 0x00, 0x1A, 0x50, 0x10, 0x01, 0x00, 0x00, 0x01, noteNumber, 0xF7]
			this.sendCommand('NAME', Buffer.from(midiCommand))
		}
		
		// Poll Mix names
		for (let i = 1; i <= 32; i++) {
			const noteNumber = 0x60 + (i - 1)
			const midiCommand = [0xF0, 0x00, 0x00, 0x1A, 0x50, 0x10, 0x01, 0x00, 0x00, 0x01, noteNumber, 0xF7]
			this.sendCommand('NAME', Buffer.from(midiCommand))
		}
		
		// Poll DCA names
		for (let i = 1; i <= 16; i++) {
			const noteNumber = 0x10 + (i - 1)
			const midiCommand = [0xF0, 0x00, 0x00, 0x1A, 0x50, 0x10, 0x01, 0x00, 0x00, 0x01, noteNumber, 0xF7]
			this.sendCommand('NAME', Buffer.from(midiCommand))
		}
	}

	// Protocol Methods
	sendCommand(cmd, params = '') {
		if (!this.connected) {
			this.commandQueue.push([cmd, params])
			return
		}

		try {
			const buffer = Buffer.from(params)
			this.socket.write(buffer)
		} catch (e) {
			this.log('error', 'Error sending command: ' + e.message)
		}
	}

	processData(data) {
		// Append new data to existing buffer
		this.receivedData = Buffer.concat([this.receivedData, data])
		
		// Process complete messages
		while (this.receivedData.length > 0) {
			// Check for MIDI messages first (non-SysEx)
			if (this.receivedData[0] === 0x90) {
				// Wait until we have a complete MIDI message (5 bytes)
				if (this.receivedData.length < 5) {
					break
				}
				
				// MIDI Note On message for mute/unmute
				const channelByte = this.receivedData[1]
				const velocity = this.receivedData[2]
				
				// Process mute state if it's a valid velocity value
				// Mute: 0x40-0x7F (64-127)
				// Unmute: 0x01-0x3F (1-63)
				if (velocity >= 0x01) {
					let channelType, channel, stateKey
					
					if (channelByte >= 0x60 && channelByte <= 0x7F) {
						// Mix channel (0x60-0x7F)
						channelType = 'mix'
						channel = channelByte - 0x60 + 1
						stateKey = 'mixMute'
					} else if (channelByte >= 0x20 && channelByte <= 0x5F) {
						// Input channel (0x20-0x5F)
						channelType = 'input'
						channel = channelByte - 0x20 + 1
						stateKey = 'mute'
					} else if (channelByte >= 0x10 && channelByte <= 0x1F) {
						// DCA channel (0x10-0x1F)
						channelType = 'dca'
						channel = channelByte - 0x10 + 1
						stateKey = 'dcaMute'
					} else if (channelByte >= 0x08 && channelByte <= 0x0F) {
						// FX Return channel (0x08-0x0F)
						channelType = 'fx_return'
						channel = channelByte - 0x08 + 1
						stateKey = 'fxReturnMute'
					} else if (channelByte >= 0x00 && channelByte <= 0x07) {
						// FX Send channel (0x00-0x07)
						channelType = 'fx_send'
						channel = channelByte + 1
						stateKey = 'fxMute'
					}

					// Velocity >= 0x40 (64) means muted
					const isMuted = velocity >= 0x40
					this.channelStates[stateKey][channel] = isMuted
					
					// Update feedback
					this.checkFeedbacks('channelMute')
				}
				
				// Remove the processed message
				this.receivedData = this.receivedData.slice(5)
				continue
			}
			
			// Look for SysEx start (F0) and end (F7)
			const startIndex = this.receivedData.indexOf(0xF0)
			if (startIndex === -1) {
				// No SysEx start found, but we might have partial MIDI data
				// Only clear if we have non-MIDI data or more than 5 bytes
				if (this.receivedData[0] !== 0x90 || this.receivedData.length > 5) {
					this.receivedData = Buffer.alloc(0)
				}
				break
			}
			
			const endIndex = this.receivedData.indexOf(0xF7, startIndex)
			if (endIndex === -1) {
				// No end byte found, wait for more data
				break
			}
			
			// Extract complete message
			const message = this.receivedData.slice(startIndex, endIndex + 1)
			this.receivedData = this.receivedData.slice(endIndex + 1)
			
			// Process the message
			this.processSysExMessage(message)
		}
	}

	processSysExMessage(message) {
		// Check if this is a channel name response
		// F0 00 00 1A 50 10 01 00 00 02 CH Name F7
		if (message.length >= 12 &&
			message[0] === 0xF0 &&
			message[1] === 0x00 &&
			message[2] === 0x00 &&
			message[3] === 0x1A &&
			message[4] === 0x50 &&
			message[5] === 0x10 &&
			message[6] === 0x01 &&
			message[7] === 0x00 &&
			message[8] === 0x00 &&
			message[9] === 0x02) {
			
			const channelByte = message[10]
			const nameBytes = message.slice(11, -1) // Exclude F7
			const name = nameBytes.toString('ascii').trim()
			
			let channelType, channel, stateKey, variableId
			
			if (channelByte >= 0x60 && channelByte <= 0x7F) {
				// Mix channel (0x60-0x7F)
				channelType = 'mix'
				channel = channelByte - 0x60 + 1
				stateKey = 'mixName'
				variableId = `mix_${channel}_name`
			} else if (channelByte >= 0x20 && channelByte <= 0x5F) {
				// Input channel (0x20-0x5F)
				channelType = 'input'
				channel = channelByte - 0x20 + 1
				stateKey = 'name'
				variableId = `ch_${channel}_name`
			} else if (channelByte >= 0x10 && channelByte <= 0x1F) {
				// DCA channel (0x10-0x1F)
				channelType = 'dca'
				channel = channelByte - 0x10 + 1
				stateKey = 'dcaName'
				variableId = `dca_${channel}_name`
			} else if (channelByte >= 0x08 && channelByte <= 0x0F) {
				// FX Return channel (0x08-0x0F)
				channelType = 'fx_return'
				channel = channelByte - 0x08 + 1
				stateKey = 'fxReturnName'
				variableId = `fx_return_${channel}_name`
			} else if (channelByte >= 0x00 && channelByte <= 0x07) {
				// FX Send channel (0x00-0x07)
				channelType = 'fx_send'
				channel = channelByte + 1
				stateKey = 'fxSendName'
				variableId = `fx_send_${channel}_name`
			}
			
			this.channelStates[stateKey][channel] = name
			this.setVariableValues({ [variableId]: name })
			this.checkFeedbacks('channelName')
		}
	}

	initActions() {
		this.setActionDefinitions(getActions(this))
	}

	initFeedbacks() {
		this.setFeedbackDefinitions(getFeedbacks(this))
		this.subscribeFeedbacks('channelMute')
	}

	initVariables() {
		this.setVariableDefinitions(getVariables(this))
	}
}

runEntrypoint(iLiveInstance, upgradeScripts)
