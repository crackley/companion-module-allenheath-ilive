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
		}
		this.receivedData = Buffer.alloc(0)
		this.pollTimer = null
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
				tooltip: 'How often to poll for channel names (0 to disable)',
				width: 4,
				default: 1,
				min: 0,
				max: 60,
			},
			{
				type: 'number',
				id: 'maxChannel',
				label: 'Max Channel to Poll',
				tooltip: 'Highest channel number to poll for names',
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
			this.updateStatus(InstanceStatus.BadConfig, 'IP address not configured')
			return
		}

		this.socket = new net.Socket()
		this.connected = false

		this.socket.on('connect', () => {
			this.connected = true
			this.updateStatus(InstanceStatus.Ok)
			this.log('debug', 'Connected to iLive')
			
			// Initial poll for all channel names
			if (this.config.pollInterval > 0) {
				this.pollChannelNames()
			}
		})

		this.socket.on('data', (data) => {
			this.processData(data)
		})

		this.socket.on('error', (err) => {
			this.log('error', 'Socket error: ' + err)
			this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
		})

		this.socket.on('close', () => {
			if (this.connected) {
				this.connected = false
				this.updateStatus(InstanceStatus.Disconnected)
				this.log('debug', 'Connection closed')
			}

			// Try to reconnect after 5 seconds
			setTimeout(() => {
				this.initConnection()
			}, 5000)
		})

		// Connect to the mixer using fixed port 51325
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
		const maxChannel = this.config.maxChannel || 32
		for (let channel = 1; channel <= maxChannel; channel++) {
			// Create the SysEx message: F0 00 00 1A 50 10 01 00 00 01 CH F7
			// Channel numbers start at 0x20 for channel 1
			const sysex = Buffer.from([
				0xF0, 0x00, 0x00, 0x1A, 0x50, 0x10, 0x01, 0x00, 0x00, 0x01,
				0x20 + (channel - 1), // 0x20 = ch1, 0x21 = ch2, etc.
				0xF7
			])
			this.sendCommand('NAME', sysex)
		}
	}

	// Protocol Methods
	sendCommand(cmd, params = '') {
		if (!this.connected) {
			this.log('debug', 'Not connected, queueing command: ' + cmd)
			this.commandQueue.push([cmd, params])
			return
		}

		try {
			const buffer = Buffer.from(params)
			this.socket.write(buffer)
			this.log('debug', `Sent: ${buffer.toString('hex')}`)
		} catch (e) {
			this.log('error', 'Error sending command: ' + e.message)
		}
	}

	processData(data) {
		// Append new data to existing buffer
		this.receivedData = Buffer.concat([this.receivedData, data])
		
		// Process complete messages
		while (this.receivedData.length > 0) {
			// Look for SysEx start (F0) and end (F7)
			const startIndex = this.receivedData.indexOf(0xF0)
			if (startIndex === -1) {
				// No start byte found, clear buffer
				this.receivedData = Buffer.alloc(0)
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
		this.log('debug', `Received SysEx: ${message.toString('hex')}`)
		
		// Check if this is a channel name response
		// F0 00 00 1A 50 10 01 00 00 02 CH Name F7
		if (message.length >= 12 &&
			message[1] === 0x00 && message[2] === 0x00 && 
			message[3] === 0x1A && message[4] === 0x50 &&
			message[5] === 0x10 && message[6] === 0x01 &&
			message[7] === 0x00 && message[8] === 0x00 &&
			message[9] === 0x02) {
			
			const channel = message[10] - 0x20 + 1 // Convert from MIDI note (0x20+) to channel number (1+)
			// Extract name (everything between channel number and F7)
			const nameBuffer = message.slice(11, -1)
			
			// Clean the name string:
			// 1. Convert to ascii and trim whitespace
			// 2. Replace null bytes and non-printable characters
			// 3. Ensure the string is properly terminated
			const name = nameBuffer
				.toString('ascii')
				.replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
				.trim();
			
			// Update channel name
			this.channelStates.name[channel] = name
			this.setVariableValues({ [`ch_${channel}_name`]: name })
			this.checkFeedbacks('channelName')
			
			this.log('debug', `Channel ${channel} name: ${name}`)
		}
	}

	initActions() {
		this.setActionDefinitions(getActions(this))
	}

	initFeedbacks() {
		this.setFeedbackDefinitions(getFeedbacks(this))
	}

	initVariables() {
		this.setVariableDefinitions(getVariables(this))
	}
}

runEntrypoint(iLiveInstance, upgradeScripts)
