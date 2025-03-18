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
			this.channelStates.fader[i] = -54 // Input channels default to -54 dB
		}
		for (let i = 1; i <= 8; i++) {
			this.channelStates.fxMute[i] = false
			this.channelStates.fxReturnMute[i] = false
			this.channelStates.fxSendName[i] = ''
			this.channelStates.fxReturnName[i] = ''
			this.channelStates.fxFader[i] = 0 // FX Sends default to 0 dB
			this.channelStates.fxReturnFader[i] = -54 // FX Returns default to -54 dB
		}
		for (let i = 1; i <= 32; i++) {
			this.channelStates.mixMute[i] = false
			this.channelStates.mixName[i] = ''
			this.channelStates.mixFader[i] = 0 // Mix channels default to 0 dB
		}
		for (let i = 1; i <= 16; i++) {
			this.channelStates.dcaMute[i] = false
			this.channelStates.dcaName[i] = ''
			this.channelStates.dcaFader[i] = 0 // DCA channels default to 0 dB
		}
	}

	async init(config) {
		this.config = config
		
		this.updateStatus(InstanceStatus.Connecting)
		
		this.initConnection()
		this.initActions()
		this.initFeedbacks()
		this.initVariables()
		
		// Initialize variable values after defining them
		for (let i = 1; i <= 64; i++) {
			this.setVariableValues({ [`ch_${i}_fader`]: '-54.0' })
		}
		for (let i = 1; i <= 8; i++) {
			this.setVariableValues({
				[`fx_send_${i}_fader`]: '0.0',
				[`fx_return_${i}_fader`]: '-54.0'
			})
		}
		for (let i = 1; i <= 32; i++) {
			this.setVariableValues({ [`mix_${i}_fader`]: '0.0' })
		}
		for (let i = 1; i <= 16; i++) {
			this.setVariableValues({ [`dca_${i}_fader`]: '0.0' })
		}
		
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
			this.pollTimer = setInterval(async () => {
				if (this.connected) {
					await this.pollChannelNames()
				}
			}, this.config.pollInterval * 1000)  // Convert seconds to milliseconds
		}
	}

	stopPolling() {
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
			this.pollTimer = null
		}
	}

	async pollChannelNames() {
		if (!this.connected) return
		
		this.log('debug', 'Starting channel name polling...')
		
		// Helper function to send name request with delay
		const sendNameRequest = (noteNumber) => {
			const midiCommand = [0xF0, 0x00, 0x00, 0x1A, 0x50, 0x10, 0x01, 0x00, 0x00, 0x01, noteNumber, 0xF7]
			this.sendCommand('NAME', Buffer.from(midiCommand))
		}
		
		// Helper function to add delay between requests
		const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))
		
		try {
			// Poll input channel names (1-64)
			this.log('debug', 'Polling input channel names (1-64)')
			for (let i = 1; i <= 64; i++) {
				const noteNumber = 0x20 + (i - 1)
				sendNameRequest(noteNumber)
				await delay(10) // 10ms delay between each request
			}
			await delay(100) // 100ms delay between channel types
			
			// Poll FX Send names (1-8)
			this.log('debug', 'Polling FX Send names (1-8)')
			for (let i = 1; i <= 8; i++) {
				const noteNumber = 0x00 + (i - 1)
				sendNameRequest(noteNumber)
				await delay(10)
			}
			await delay(100)
			
			// Poll FX Return names (1-8)
			this.log('debug', 'Polling FX Return names (1-8)')
			for (let i = 1; i <= 8; i++) {
				const noteNumber = 0x08 + (i - 1)
				sendNameRequest(noteNumber)
				await delay(10)
			}
			await delay(100)
			
			// Poll Mix names (1-32)
			this.log('debug', 'Polling Mix names (1-32)')
			for (let i = 1; i <= 32; i++) {
				const noteNumber = 0x60 + (i - 1)
				sendNameRequest(noteNumber)
				await delay(10)
			}
			await delay(100)
			
			// Poll DCA names (1-16)
			this.log('debug', 'Polling DCA names (1-16)')
			for (let i = 1; i <= 16; i++) {
				const noteNumber = 0x10 + (i - 1)
				sendNameRequest(noteNumber)
				await delay(10)
			}
			
			this.log('debug', 'Channel name polling complete')
		} catch (error) {
			this.log('error', `Error during channel name polling: ${error.message}`)
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
		// Only log received data if it's not a timing byte (0xFE)
		if (data.length > 1 || data[0] !== 0xFE) {
			this.log('debug', `Received data: ${data.toString('hex').match(/.{1,2}/g).join(' ')}`)
			this.log('debug', `Current buffer size: ${this.receivedData.length} bytes`)
		}
		
		// Append new data to existing buffer
		this.receivedData = Buffer.concat([this.receivedData, data])
		
		// Process complete messages
		while (this.receivedData.length > 0) {
			// Skip timing bytes (0xFE) silently
			if (this.receivedData[0] === 0xFE) {
				this.receivedData = this.receivedData.slice(1)
				continue
			}
			
			// Log current state of processing buffer for non-timing bytes
			if (this.receivedData[0] !== 0xFE) {
				this.log('debug', `Processing buffer (${this.receivedData.length} bytes): ${this.receivedData.toString('hex').match(/.{1,2}/g).join(' ')}`)
			}
			
			// Safety check - if buffer gets too large, clear it
			if (this.receivedData.length > 1024) {
				this.log('warn', 'Buffer overflow detected, clearing buffer')
				this.receivedData = Buffer.alloc(0)
				break
			}
			
			// Check for SysEx messages (F0 ...)
			if (this.receivedData[0] === 0xF0) {
				// Find the end of the SysEx message (F7)
				const endIndex = this.receivedData.indexOf(0xF7)
				if (endIndex === -1) {
					if (this.receivedData.length > 128) {
						// If we have too much data without an F7, discard the malformed message
						this.log('warn', 'Malformed SysEx message detected (no F7 end marker), discarding buffer')
						this.receivedData = Buffer.alloc(0)
					} else {
						this.log('debug', 'Incomplete SysEx message, waiting for more data')
					}
					break
				}
				
				// Process the complete SysEx message
				const message = this.receivedData.slice(0, endIndex + 1)
				this.processSysExMessage(message)
				
				// Remove the processed message from the buffer
				this.receivedData = this.receivedData.slice(endIndex + 1)
				continue
			}
			
			// Check for MIDI Note On messages (90 NN VV)
			if (this.receivedData[0] === 0x90) {
				// Wait for complete Note On message
				if (this.receivedData.length < 3) {
					this.log('debug', 'Incomplete Note On message, waiting for more data')
					break
				}

				const noteNumber = this.receivedData[1]
				const velocity = this.receivedData[2]
				
				this.log('debug', `Found Note On message - Note: ${noteNumber.toString(16)}, Velocity: ${velocity}`)
				
				// Process mute state if it's a valid velocity value
				if (velocity >= 0x01) {
					let channelType, channel, stateKey
					
					if (noteNumber >= 0x60 && noteNumber <= 0x7F) {
						// Mix channel (0x60-0x7F)
						channelType = 'mix'
						channel = noteNumber - 0x60 + 1
						stateKey = 'mixMute'
					} else if (noteNumber >= 0x20 && noteNumber <= 0x5F) {
						// Input channel (0x20-0x5F)
						channelType = 'input'
						channel = noteNumber - 0x20 + 1
						stateKey = 'mute'
					} else if (noteNumber >= 0x00 && noteNumber <= 0x07) {
						// FX Send (0x00-0x07)
						channelType = 'fx_send'
						channel = noteNumber + 1
						stateKey = 'fxMute'
					} else if (noteNumber >= 0x08 && noteNumber <= 0x0F) {
						// FX Return (0x08-0x0F)
						channelType = 'fx_return'
						channel = noteNumber - 0x08 + 1
						stateKey = 'fxReturnMute'
					} else if (noteNumber >= 0x10 && noteNumber <= 0x1F) {
						// DCA (0x10-0x1F)
						channelType = 'dca'
						channel = noteNumber - 0x10 + 1
						stateKey = 'dcaMute'
					}

					if (stateKey) {
						// Velocity >= 0x40 (64) means muted
						const isMuted = velocity >= 0x40
						this.log('debug', `Updating ${channelType} channel ${channel} mute to ${isMuted ? 'muted' : 'unmuted'}`)
						this.channelStates[stateKey][channel] = isMuted
						
						// Update feedback
						this.checkFeedbacks('channelMute')
					}
				}
				
				// Remove the processed message
				this.receivedData = this.receivedData.slice(3)
				continue
			}
			
			// Check for fader level messages (B0 63 CH 62 17 06 LV)
			if (this.receivedData[0] === 0xB0) {
				// Wait for complete fader message
				if (this.receivedData.length < 7) {
					if (this.receivedData.length > 32) {
						// If we have too much partial data, it's probably malformed
						this.log('warn', 'Malformed fader message detected, discarding buffer')
						this.receivedData = Buffer.alloc(0)
					} else {
						this.log('debug', 'Incomplete fader message, waiting for more data')
					}
					break
				}

				// Verify this is actually a fader message
				if (this.receivedData[1] !== 0x63 || this.receivedData[3] !== 0x62 || 
					this.receivedData[4] !== 0x17 || this.receivedData[5] !== 0x06) {
					// Not a valid fader message, discard first byte and continue
					if (this.receivedData[0] !== 0xFE) {  // Don't log timing bytes
						this.log('warn', 'Invalid fader message format, discarding byte')
					}
					this.receivedData = this.receivedData.slice(1)
					continue
				}

				const channelByte = this.receivedData[2]
				const midiLevel = this.receivedData[6]
				
				this.log('debug', `Found complete fader message - Channel: ${channelByte.toString(16)}, Level: ${midiLevel}`)
				
				// Convert MIDI value back to dB using formula: dB = ((midi * 64) / 127) - 54
				const level = ((midiLevel * 64) / 127) - 54
				
				let channelType, channel, stateKey, varPrefix
				
				if (channelByte >= 0x60 && channelByte <= 0x7F) {
					// Mix channel (0x60-0x7F)
					channelType = 'mix'
					channel = channelByte - 0x60 + 1
					stateKey = 'mixFader'
					varPrefix = 'mix'
				} else if (channelByte >= 0x20 && channelByte <= 0x5F) {
					// Input channel (0x20-0x5F)
					channelType = 'input'
					channel = channelByte - 0x20 + 1
					stateKey = 'fader'
					varPrefix = 'ch'
				} else if (channelByte >= 0x00 && channelByte <= 0x07) {
					// FX Send (0x00-0x07)
					channelType = 'fx_send'
					channel = channelByte + 1
					stateKey = 'fxFader'
					varPrefix = 'fx_send'
				} else if (channelByte >= 0x08 && channelByte <= 0x0F) {
					// FX Return (0x08-0x0F)
					channelType = 'fx_return'
					channel = channelByte - 0x08 + 1
					stateKey = 'fxReturnFader'
					varPrefix = 'fx_return'
				} else if (channelByte >= 0x10 && channelByte <= 0x1F) {
					// DCA (0x10-0x1F)
					channelType = 'dca'
					channel = channelByte - 0x10 + 1
					stateKey = 'dcaFader'
					varPrefix = 'dca'
				} else {
					// Unknown channel type, discard the message
					this.log('warn', `Unknown channel type: ${channelByte.toString(16)}`)
					this.receivedData = this.receivedData.slice(7)
					continue
				}
				
				// Update the channel state and variable
				this.channelStates[stateKey][channel] = level
				this.setVariableValues({
					[`${varPrefix}_${channel}_fader`]: level.toFixed(1)
				})
				
				// Remove the processed message from the buffer
				this.receivedData = this.receivedData.slice(7)
				continue
			}
			
			// Unknown message type, discard first byte
			if (this.receivedData[0] !== 0xFE) {  // Don't log timing bytes
				this.log('warn', `Unknown message type: ${this.receivedData[0].toString(16)}, discarding byte`)
			}
			this.receivedData = this.receivedData.slice(1)
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
			
			// Log raw name bytes for debugging
			this.log('debug', `Raw name bytes: ${nameBytes.toString('hex').match(/.{1,2}/g).join(' ')}`)
			
			// Convert to ASCII and clean up the text
			let name = ''
			for (let i = 0; i < nameBytes.length; i++) {
				const byte = nameBytes[i]
				// Only include printable ASCII characters (32-126)
				if (byte >= 0x20 && byte <= 0x7E) {
					name += String.fromCharCode(byte)
				}
			}
			name = name.trim()
			
			this.log('debug', `Cleaned channel name: "${name}"`)
			
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
			
			if (stateKey) {
				this.log('debug', `Setting ${channelType} channel ${channel} name to "${name}"`)
				this.channelStates[stateKey][channel] = name
				this.setVariableValues({ [variableId]: name })
				this.checkFeedbacks('channelName')
			}
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
