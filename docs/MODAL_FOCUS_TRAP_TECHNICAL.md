# Modal Accessibility Implementation Details

## Component Hierarchy

```
App.svelte
├── FocusTrap (wrapper around each modal)
│   └── Modal Dialog
│       ├── Header (with aria-labelledby)
│       ├── Body (with aria-describedby)
│       └── Footer Actions (role="group")
```

## FocusTrap.svelte - Implementation Deep Dive

### Event Handling Flow

1. **Focus Trap Initialization (onMount)**
   ```typescript
   - Store currently focused element (previouslyFocused)
   - Call focusFirstElement() to move focus into modal
   - Attach keydown listener for Tab/Escape handling
   ```

2. **Tab Key Handling**
   ```
   User presses Tab → handleKeyDown triggered
   → Get all focusable elements in modal
   → Calculate next focus index
   → If at end, wrap to beginning
   → preventDefault() and focus next element
   ```

3. **Escape Key Handling**
   ```
   User presses Escape → handleKeyDown triggered
   → preventDefault()
   → Dispatch 'escapepressed' CustomEvent
   → Parent component receives event and closes modal
   ```

4. **Cleanup (onMount return/destroy)**
   ```
   Modal closes → cleanup function runs
   → Remove keydown listener
   → Restore focus to previouslyFocused element
   ```

### Focusable Elements Detection

```typescript
const focusableSelectors = [
  'a[href]',                           // Links
  'button:not([disabled])',            // Enabled buttons
  'input:not([disabled])',             // Enabled inputs
  'select:not([disabled])',            // Enabled selects
  'textarea:not([disabled])',          // Enabled textareas
  '[tabindex]:not([tabindex="-1"])'   // Custom focusable elements
].join(',');
```

## ColumnManager.svelte - Focus Management

### Save Button Focus

```typescript
let saveButtonRef: HTMLButtonElement | null = null;

onMount(() => {
  if (saveButtonRef) {
    saveButtonRef.focus();
  }
});

// In template:
<button bind:this={saveButtonRef} on:click={save} class="ps-btn--primary">
  Save
</button>
```

**Why:** Primary action should receive focus for keyboard users and screen reader users.

### Escape Handling

```typescript
function handleEscape(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    dispatch('cancel');
  }
}

// In template:
<div class="column-manager" on:keydown={handleEscape} role="presentation">
```

**Why:** Provides fallback if FocusTrap doesn't catch event, and gives component flexibility.

## App.svelte - Modal Integration

### JSON Editor Focus Sequence

1. **User clicks button to open editor**
   ```
   openJsonEditor(row, column) called
   ```

2. **State updates**
   ```typescript
   jsonEditorOpen = true;
   jsonDraft = formatCellValue(...);
   ```

3. **Svelte reactive block runs**
   ```
   DOM updates with new modal
   ```

4. **setTimeout callback runs**
   ```typescript
   setTimeout(() => {
     if (jsonTextarea) {
       jsonTextarea.focus();
       jsonTextarea.select();
     }
   }, 0);
   ```
   **Why:** Ensures DOM is fully rendered before attempting to focus. `select()` helps users quickly replace content.

5. **FocusTrap initializes**
   ```
   onMount in FocusTrap runs:
   - Store focus (might be on button initially, but will move)
   - focusFirstElement() called
   - But textarea already focused, so stays focused
   - keydown listener attached
   ```

6. **User types or presses keys**
   ```
   - Typing goes into textarea
   - Tab/Shift+Tab navigates to other controls
   - Escape closes modal
   ```

7. **Modal closes**
   ```
   closeJsonEditor() called
   - jsonEditorOpen = false
   - FocusTrap cleanup runs
   - Focus restored to previously focused element (the button that opened it)
   ```

### ARIA Attributes Pattern

For all modals:

```html
<FocusTrap ariaLabel="Modal Purpose">
  <div role="dialog"
       aria-modal="true"
       aria-labelledby="heading-id"
       aria-describedby="content-id">
    
    <header>
      <h3 id="heading-id">Clear, descriptive heading</h3>
    </header>
    
    <div id="content-id" class="modal-body">
      <!-- Main content -->
    </div>
    
    <footer role="group">
      <!-- Action buttons -->
    </footer>
  </div>
</FocusTrap>
```

## Error Messaging with ARIA

### JSON Editor Error Display

```html
<textarea
  aria-invalid={jsonError ? 'true' : 'false'}
  aria-describedby={jsonError ? 'json-error-message' : undefined}
></textarea>

{#if jsonError}
  <p id="json-error-message" class="error" role="alert">
    {jsonError}
  </p>
{/if}
```

**How it works for screen readers:**
1. User focuses textarea
2. Screen reader announces "invalid"
3. Screen reader announces "described by json-error-message"
4. When error appears, screen reader announces it due to `role="alert"`
5. Keyboard user can Tab to see error message

## Keyboard Shortcuts Reference

| Key | Action | Location |
|-----|--------|----------|
| Tab | Next focusable element | All modals |
| Shift+Tab | Previous focusable element | All modals |
| Escape | Close modal | All modals |
| Enter | Confirm (button default) | Buttons |
| Alt+R | Show all hidden columns | Hidden Columns Modal |
| Alt+H | Toggle help | Hidden Columns Modal |
| Alt+↑ / Alt+↓ | Move column | Column Manager |

## Testing Checklist

### Keyboard Navigation
- [ ] Tab cycles through all focusable elements
- [ ] Shift+Tab moves backward
- [ ] Focus wraps at edges
- [ ] Escape closes modal
- [ ] Focus returns to triggering element after close

### Screen Reader (NVDA/JAWS/VoiceOver)
- [ ] Modal announced as "dialog"
- [ ] Heading announced as dialog name
- [ ] Description announced for context
- [ ] All buttons have accessible names
- [ ] Error messages announced
- [ ] Focus changes announced

### Visual Testing
- [ ] Focus visible on all elements (high contrast outline)
- [ ] Focus order logical (left-to-right, top-to-bottom)
- [ ] Error indicators clear
- [ ] Buttons have clear visual state (enabled/disabled)

### Edge Cases
- [ ] Modal within modal (if supported)
- [ ] Very long content (scrolling doesn't break focus)
- [ ] Rapid open/close cycles
- [ ] Multiple modals opening simultaneously

## Performance Considerations

1. **setTimeout in openJsonEditor/openTextEditor**
   - Ensures DOM rendering completes first
   - Minimal performance impact (0ms timeout)
   - Prevents "element not found" errors

2. **FocusTrap element collection**
   - Runs on Tab key press only (not on every frame)
   - querySelectorAll is fast for small modal sizes
   - Could be optimized with cached list if needed

3. **Focus restoration**
   - Uses stored reference (O(1) lookup)
   - Graceful error handling prevents crashes
   - No DOM traversal needed

## Accessibility API Support

### Browser DevTools
```
Elements panel → Accessibility tab shows:
- Dialog role
- aria-modal: true
- aria-labelledby: (heading)
- aria-describedby: (content)
- aria-invalid/aria-describedby on form elements
```

### Screen Reader Inspector
Check computed accessible tree:
```
Role: dialog
Name: [from aria-labelledby]
Description: [from aria-describedby]
├─ heading (id=...)
├─ textbox/generic
└─ group (buttons)
    ├─ button "Save"
    ├─ button "Cancel"
```

## Future Enhancements

1. **Modal stacking** - If adding support for modals within modals:
   - Ensure focus trap works with nested containers
   - Test Alt+Tab behavior
   - Consider z-index management

2. **Animated transitions** - If adding open/close animations:
   - Ensure focus management doesn't race with animations
   - Consider using Svelte transitions module
   - Test with screen readers for announcement timing

3. **Custom keyboard shortcuts** - If adding Alt+S for Save, etc.:
   - Document in visible keyboard help
   - Avoid conflicts with browser shortcuts
   - Announce in tooltips

4. **Mobile/Touch support** - If adding touch interactions:
   - Maintain keyboard support as primary
   - Ensure swipe actions don't break focus
   - Test with mobile screen readers

## References

- [WAI-ARIA: Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialogmodal/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [MDN: Focus Management](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Focus_management)
- [MDN: ARIA: dialog role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/dialog_role)
