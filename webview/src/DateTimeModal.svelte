<script lang="ts">
	import { onMount } from 'svelte';
	import FocusTrap from '$lib/components/FocusTrap.svelte';

	export let isOpen = false;
	export let value: string = '';
	export let onClose: () => void = () => {};
	export let onSave: (value: string) => void = () => {};
	export let columnType: string = 'timestamp with time zone';

	let dateInput: string = '';
	let timeInput: string = '';
	let timezoneInput: string = 'UTC';
	let errorMessage: string = '';

	const timezones = [
		'UTC',
		'America/New_York',
		'America/Los_Angeles',
		'America/Chicago',
		'America/Denver',
		'Europe/London',
		'Europe/Paris',
		'Europe/Berlin',
		'Asia/Tokyo',
		'Asia/Shanghai',
		'Asia/Hong_Kong',
		'Australia/Sydney',
		'Pacific/Auckland'
	];

	onMount(() => {
		if (value) {
			try {
				const date = new Date(value);
				dateInput = date.toISOString().split('T')[0];
				timeInput = date.toISOString().split('T')[1]?.split('.')[0] || '00:00:00';

				// Try to extract timezone info
				if (columnType.includes('time zone')) {
					// If value contains timezone info, try to parse it
					const tzMatch = value.match(/([A-Z_]+)$/);
					if (tzMatch) {
						timezoneInput = tzMatch[1];
					}
				}
			} catch (e) {
				// If value can't be parsed as date, treat as raw string
				dateInput = '';
				timeInput = '';
			}
		}
	});

	function generateDateTime(): string {
		if (!dateInput) {
			errorMessage = 'Date is required';
			return '';
		}

		const timeValue = timeInput || '00:00:00';
		const isoString = `${dateInput}T${timeValue}`;

		if (columnType.includes('time zone')) {
			// For timestamp with time zone, append the timezone
			return `${isoString}+00:00`; // PostgreSQL will handle timezone conversion
		} else if (columnType.includes('timestamp')) {
			// For timestamp without time zone, just return ISO string
			return new Date(isoString).toISOString();
		} else if (columnType === 'date') {
			// For date type, just return the date
			return dateInput;
		} else if (columnType === 'time') {
			// For time type, just return the time
			return timeValue;
		}

		return isoString;
	}

	function handleSave() {
		errorMessage = '';
		const dateTimeValue = generateDateTime();

		if (!dateTimeValue) {
			return; // Error message already set
		}

		onSave(dateTimeValue);
		isOpen = false;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleSave();
		} else if (e.key === 'Escape') {
			onClose();
		}
	}

	function clearValue() {
		dateInput = '';
		timeInput = '';
		onSave('');
		isOpen = false;
	}

	function setToNow() {
		const now = new Date();
		dateInput = now.toISOString().split('T')[0];
		timeInput = now.toISOString().split('T')[1]?.split('.')[0] || '00:00:00';
	}
</script>

{#if isOpen}
	<div class="modal-backdrop" on:click={onClose} role="presentation"></div>
	<FocusTrap>
		<div class="modal dialog" role="dialog" aria-labelledby="datetime-title" aria-modal="true">
			<div class="modal-header">
				<h2 id="datetime-title">Edit {columnType}</h2>
				<button
					class="modal-close-btn"
					on:click={onClose}
					aria-label="Close dialog"
					title="Close (Esc)"
				>
					✕
				</button>
			</div>

			<div class="modal-body">
				{#if errorMessage}
					<div class="error-message" role="alert">{errorMessage}</div>
				{/if}

				<div class="form-group">
					<label for="date-input">Date</label>
					<input
						id="date-input"
						type="date"
						bind:value={dateInput}
						on:keydown={handleKeyDown}
					/>
				</div>

				{#if !columnType.includes('date') || columnType.includes('timestamp')}
					<div class="form-group">
						<label for="time-input">Time</label>
						<input
							id="time-input"
							type="time"
							bind:value={timeInput}
							step="1"
							on:keydown={handleKeyDown}
						/>
					</div>

					{#if columnType.includes('time zone')}
						<div class="form-group">
							<label for="tz-select">Timezone</label>
							<select id="tz-select" bind:value={timezoneInput}>
								{#each timezones as tz}
									<option value={tz}>{tz}</option>
								{/each}
							</select>
							<small>PostgreSQL will adjust to server timezone</small>
						</div>
					{/if}
				{/if}

				<div class="current-value">
					<strong>Current value:</strong>
					<code>{value || '(empty)'}</code>
				</div>
			</div>

			<div class="modal-footer">
				<button class="btn btn-secondary" on:click={clearValue}>
					Clear
				</button>
				<button class="btn btn-secondary" on:click={setToNow}>
					Now
				</button>
				<button class="btn btn-secondary" on:click={onClose}>
					Cancel
				</button>
				<button class="btn btn-primary" on:click={handleSave}>
					Save
				</button>
			</div>
		</div>
	</FocusTrap>
{/if}

<style>
	:global(.modal-backdrop) {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-color: rgba(0, 0, 0, 0.5);
		z-index: 1000;
	}

	:global(.modal.dialog) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background-color: var(--vscode-editor-background);
		border: 1px solid var(--vscode-panel-border);
		border-radius: 4px;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
		z-index: 1001;
		max-width: 500px;
		width: 90%;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		outline: none;
	}

	:global(.modal-header) {
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		border-bottom: 1px solid var(--vscode-panel-border);
		background-color: var(--vscode-titleBar-inactiveBackground);
	}

	:global(.modal-header h2) {
		margin: 0;
		font-size: 1rem;
		flex: 1;
		color: var(--vscode-foreground);
	}

	:global(.modal-close-btn) {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: var(--vscode-foreground);
		padding: 0 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	:global(.modal-close-btn:hover) {
		color: var(--vscode-button-background);
	}

	:global(.modal-body) {
		flex: 1;
		padding: 1.5rem;
		overflow-y: auto;
		color: var(--vscode-foreground);
	}

	:global(.modal-footer) {
		display: flex;
		gap: 0.5rem;
		padding: 1rem;
		border-top: 1px solid var(--vscode-panel-border);
		background-color: var(--vscode-titleBar-inactiveBackground);
		justify-content: flex-end;
		flex-wrap: wrap;
	}

	.form-group {
		margin-bottom: 1rem;
		display: flex;
		flex-direction: column;
	}

	label {
		font-weight: bold;
		margin-bottom: 0.5rem;
		color: var(--vscode-foreground);
	}

	input[type='date'],
	input[type='time'],
	select {
		padding: 0.5rem;
		background-color: var(--vscode-input-background);
		color: var(--vscode-input-foreground);
		border: 1px solid var(--vscode-input-border);
		border-radius: 3px;
		font-family: var(--vscode-font-family);
		font-size: 0.9rem;
	}

	input[type='date']:focus,
	input[type='time']:focus,
	select:focus {
		outline: none;
		border-color: var(--vscode-focusBorder);
		background-color: var(--vscode-input-background);
	}

	small {
		display: block;
		margin-top: 0.25rem;
		color: var(--vscode-editorCodeLens-foreground);
		font-size: 0.85em;
	}

	.current-value {
		margin-top: 1.5rem;
		padding: 0.75rem;
		background-color: var(--vscode-editorGroupHeader-tabsBorder);
		border-radius: 3px;
		border-left: 3px solid var(--vscode-editorCodeLens-foreground);
	}

	.current-value strong {
		display: block;
		margin-bottom: 0.5rem;
		color: var(--vscode-foreground);
	}

	code {
		background-color: var(--vscode-textCodeBlock-background);
		color: var(--vscode-textCodeBlock-foreground);
		padding: 0.25rem 0.5rem;
		border-radius: 2px;
		font-family: monospace;
		font-size: 0.85em;
	}

	.error-message {
		background-color: var(--vscode-editorError-background);
		color: var(--vscode-editorError-foreground);
		padding: 0.75rem;
		border-radius: 3px;
		margin-bottom: 1rem;
		border-left: 3px solid var(--vscode-editorError-foreground);
	}

	:global(.btn) {
		padding: 0.5rem 1rem;
		border: 1px solid var(--vscode-button-border);
		background-color: var(--vscode-button-secondaryBackground);
		color: var(--vscode-button-secondaryForeground);
		border-radius: 4px;
		cursor: pointer;
		font-family: var(--vscode-font-family);
		font-size: 0.9rem;
	}

	:global(.btn:hover) {
		background-color: var(--vscode-button-secondaryHoverBackground);
	}

	:global(.btn-primary) {
		background-color: var(--vscode-button-background);
		color: var(--vscode-button-foreground);
	}

	:global(.btn-primary:hover) {
		background-color: var(--vscode-button-hoverBackground);
	}

	:global(.btn-secondary) {
		background-color: var(--vscode-button-secondaryBackground);
		color: var(--vscode-button-secondaryForeground);
	}

	:global(.btn-secondary:hover) {
		background-color: var(--vscode-button-secondaryHoverBackground);
	}
</style>
