module.exports = {
	getVariables() {
		const variables = []
		
		// Add input channel name variables
		for (let i = 1; i <= 64; i++) {
			variables.push({
				name: `Input Channel ${i} Name`,
				variableId: `ch_${i}_name`,
			})
		}

		// Add FX Send channel name variables
		for (let i = 1; i <= 8; i++) {
			variables.push({
				name: `FX Send ${i} Name`,
				variableId: `fx_send_${i}_name`,
			})
		}

		// Add FX Return channel name variables
		for (let i = 1; i <= 8; i++) {
			variables.push({
				name: `FX Return ${i} Name`,
				variableId: `fx_return_${i}_name`,
			})
		}

		// Add Mix channel name variables
		for (let i = 1; i <= 32; i++) {
			variables.push({
				name: `Mix ${i} Name`,
				variableId: `mix_${i}_name`,
			})
		}
		
		return variables
	},
}
