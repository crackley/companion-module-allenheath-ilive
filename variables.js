module.exports = {
	getVariables() {
		const variables = []
		
		// Add input channel name and fader variables
		for (let i = 1; i <= 64; i++) {
			variables.push({
				name: `Input Channel ${i} Name`,
				variableId: `ch_${i}_name`,
			})
			variables.push({
				name: `Input Channel ${i} Fader Level`,
				variableId: `ch_${i}_fader`,
			})
		}

		// Add FX Send channel name and fader variables
		for (let i = 1; i <= 8; i++) {
			variables.push({
				name: `FX Send ${i} Name`,
				variableId: `fx_send_${i}_name`,
			})
			variables.push({
				name: `FX Send ${i} Fader Level`,
				variableId: `fx_send_${i}_fader`,
			})
		}

		// Add FX Return channel name and fader variables
		for (let i = 1; i <= 8; i++) {
			variables.push({
				name: `FX Return ${i} Name`,
				variableId: `fx_return_${i}_name`,
			})
			variables.push({
				name: `FX Return ${i} Fader Level`,
				variableId: `fx_return_${i}_fader`,
			})
		}

		// Add Mix channel name and fader variables
		for (let i = 1; i <= 32; i++) {
			variables.push({
				name: `Mix ${i} Name`,
				variableId: `mix_${i}_name`,
			})
			variables.push({
				name: `Mix ${i} Fader Level`,
				variableId: `mix_${i}_fader`,
			})
		}

		// Add DCA name and fader variables
		for (let i = 1; i <= 16; i++) {
			variables.push({
				name: `DCA ${i} Name`,
				variableId: `dca_${i}_name`,
			})
			variables.push({
				name: `DCA ${i} Fader Level`,
				variableId: `dca_${i}_fader`,
			})
		}
		
		return variables
	},
}
