module.exports = {
	getVariables() {
		const variables = []
		
		// Add channel name variables
		for (let i = 1; i <= 64; i++) {
			variables.push({
				name: `Channel ${i} Name`,
				variableId: `ch_${i}_name`,
			})
		}
		
		return variables
	},
}
