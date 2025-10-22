# Accessibility Quick Reference

## For Users

### Keyboard Navigation

#### General
- **Tab** - Move to next interactive element
- **Shift+Tab** - Move to previous interactive element
- **Enter** / **Space** - Activate buttons
- **Escape** - Close dialogs/modals

#### Data Grid
- **Tab** - Navigate cells and buttons
- **Arrow Keys** - In data cells (depends on input type)
- **Shift+Click** - Select range of rows
- **Ctrl/Cmd+Click** - Toggle individual row selection

#### Column Resizing
- **Tab** - Navigate to resize handle
- **Left Arrow** - Decrease width
- **Right Arrow** - Increase width
- **Shift+Left** - Large decrease
- **Shift+Right** - Large increase
- **Escape** - Cancel resize

#### Pagination
- **Tab** - Navigate to Previous/Next buttons
- **Enter** - Go to previous/next page
- Disabled buttons skipped in tab order

#### Search
- **Tab** - Focus search input
- **Type** - Enter search term
- **Enter** - Execute search
- **Escape** - Clear search

### Screen Reader Tips

#### Getting Started
- **Windows**: Use NVDA (free) or JAWS
- **Mac**: Use VoiceOver (built-in, Cmd+F5)
- **Linux**: Use ORCA

#### In This Extension
- **Table Loading**: Listen for "Table loaded: X rows"
- **Page Changes**: Announcements like "Page 2 of 5 loaded"
- **Selection**: "Row X selected" when you select
- **Updates**: Immediate feedback for successful or failed operations
- **Errors**: "Error: [description]" with details

#### Quick Tips
- Status announcements are in a live region (not always visible)
- All form labels are accessible
- Column headers describe each column
- Validation errors linked to fields
- Modal titles announced when opened

### Accessibility Features

| Feature | How to Use |
|---------|-----------|
| **Column Resize** | Focus resize handle (Tab), use arrow keys |
| **Row Selection** | Click to select, Shift+Click for range |
| **Pagination** | Use Previous/Next buttons or Tab+Enter |
| **Search** | Focus search input, type, press Enter |
| **Column Manager** | Tab through toggles, Space to show/hide |
| **Validation** | Read error below invalid field |
| **Live Updates** | Listen to announcements or check live region |

---

## For Developers

### Common Patterns

#### Button with Keyboard Support
```html
<button type="button" 
        tabindex="0"
        aria-label="Clear filters">
  Clear
</button>
```

#### Form Control with Error
```html
<input type="text"
       aria-invalid="false"
       aria-describedby="error-email" />
<span id="error-email" role="alert">
  Email is required
</span>
```

#### Live Region for Announcements
```html
<div role="status" 
     aria-live="polite" 
     aria-atomic="true" 
     class="sr-only">
  Page 2 of 5 loaded
</div>
```

#### Navigation Landmark
```html
<nav role="navigation" aria-label="Pagination">
  <button>Previous</button>
  <span>Page 1 of 5</span>
  <button>Next</button>
</nav>
```

#### Keyboard Event Handler
```typescript
function handleKeydown(event: KeyboardEvent) {
  switch(event.key) {
    case 'ArrowRight':
      handleResize(event.shiftKey ? 'large' : 'small', 'increase');
      break;
    case 'ArrowLeft':
      handleResize(event.shiftKey ? 'large' : 'small', 'decrease');
      break;
    case 'Escape':
      cancelResize();
      break;
  }
}
```

#### Focus Management
```typescript
// Save focus before opening modal
const previousFocus = document.activeElement as HTMLElement;

// Open modal
openModal();
modal.focus();

// Restore focus when closing
previousFocus?.focus();
```

### ARIA Quick Reference

#### Roles
```html
<button role="button">                    <!-- Explicit, usually not needed -->
<div role="navigation">                   <!-- Navigation landmark -->
<div role="search">                       <!-- Search region -->
<div role="status">                       <!-- Status messages -->
<div role="grid">                         <!-- Spreadsheet-like table -->
<div role="dialog" aria-modal="true">    <!-- Modal dialog -->
<div role="separator">                    <!-- Divider/resize handle -->
```

#### Attributes
```html
<!-- Labels & Descriptions -->
aria-label="Description"                  <!-- Direct label -->
aria-labelledby="id"                      <!-- Referenced label -->
aria-describedby="id"                     <!-- Additional description -->

<!-- States -->
aria-invalid="true"                       <!-- Validation error -->
aria-expanded="false"                     <!-- Expandable content -->
aria-selected="true"                      <!-- Selection state -->

<!-- Live Regions -->
aria-live="polite"                        <!-- Announce after current content -->
aria-live="assertive"                     <!-- Announce immediately -->
aria-atomic="true"                        <!-- Announce entire region -->

<!-- Orientation -->
aria-orientation="vertical"               <!-- For sliders, scrollbars -->

<!-- Sorting -->
aria-sort="ascending"                     <!-- Table column sort state -->
aria-sort="descending"
aria-sort="none"
```

### CSS for Accessibility

#### Focus Indicator
```css
button:focus,
input:focus,
select:focus {
  outline: 2px solid var(--vscode-focusBorder);
  outline-offset: 2px;
}
```

#### Screen Reader Only
```css
.sr-only {
  position: absolute;
  left: -10000px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
```

#### Focus Without Click
```css
button:focus-visible {
  outline: 2px solid var(--vscode-focusBorder);
}

button:focus:not(:focus-visible) {
  outline: none;
}
```

#### High Contrast
```css
@media (prefers-contrast: more) {
  button:focus {
    outline-width: 3px;
  }
}
```

#### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Testing Checklist

#### Before Committing
- [ ] All tests pass (`npm run test`)
- [ ] No console a11y warnings
- [ ] Tab order is logical
- [ ] Focus visible at all times
- [ ] ARIA attributes are correct
- [ ] Labels and descriptions present

#### Manual Testing
- [ ] Test with keyboard only (no mouse)
- [ ] Tab through all elements
- [ ] Use arrow keys in controls
- [ ] Test with screen reader (NVDA/VoiceOver)
- [ ] Verify color contrast (4.5:1)
- [ ] Check in light and dark themes

#### Documentation
- [ ] README updated if needed
- [ ] CHANGELOG updated
- [ ] New features documented
- [ ] Code comments explain a11y decisions

### Keyboard Event Handling

#### Do's ✅
```typescript
// Good: Use keyboard events on proper elements
<button onKeydown={handleKeyDown}>

// Good: Handle all keyboard inputs
if (event.key === 'Enter' || event.key === ' ') { }

// Good: Prevent default when handling
event.preventDefault();
```

#### Don'ts ❌
```typescript
// Bad: Keyboard on non-interactive element
<div onKeydown={handleKeyDown}>

// Bad: Only checking keyCode
if (event.keyCode === 13) { }  // Use event.key instead

// Bad: Not preventing default for custom behavior
// (if you handle it, prevent default)
```

### ARIA Misuse - Common Mistakes

| ❌ Wrong | ✅ Right |
|---------|----------|
| `aria-invalid` on button | Use on form controls only |
| `aria-label` without content | Include context in label |
| `role="button"` on div | Use `<button>` element |
| Keyboard events on span | Use on `<button>` or `<input>` |
| Multiple labels per input | Only one `<label>` per `<input>` |
| `aria-hidden` on focusable | Never hide focusable elements |
| Live region updates > 1/sec | Throttle announcements |
| Missing form labels | Always label inputs |

### Testing Tools

#### Automated
```bash
npm run test -- accessibility.spec.ts
npm run build  # Check for a11y warnings
```

#### Manual Tools
- **WebAIM Contrast Checker**: https://webaim.org/resources/contrastchecker/
- **WAVE Extension**: https://wave.webaim.org/extension/
- **Axe DevTools**: https://www.deque.com/axe/devtools/
- **Lighthouse**: Chrome DevTools → Lighthouse → Accessibility

#### Screen Readers
- **NVDA** (Windows, free)
- **JAWS** (Windows, commercial)
- **VoiceOver** (macOS, free built-in)
- **Narrator** (Windows, free built-in)

### Resources

#### Standards
- [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/) - Web Content Accessibility Guidelines
- [ARIA APG](https://www.w3.org/WAI/ARIA/apg/) - Authoring Practices Guide
- [MDN Accessibility](https://developer.mozilla.org/en-US/docs/Learn/Accessibility) - Learning resources

#### Learning
- [WebAIM](https://webaim.org/) - Articles and tools
- [The A11Y Project](https://www.a11yproject.com/) - Accessibility checklist
- [Level Access Blog](https://www.levelaccess.com/insights/) - Best practices

#### This Project
- [ACCESSIBILITY.md](./ACCESSIBILITY.md) - Feature overview
- [ACCESSIBILITY_IMPLEMENTATION.md](./ACCESSIBILITY_IMPLEMENTATION.md) - Technical details
- [webviewAccessibilityEnhancements.spec.ts](../test/webviewAccessibilityEnhancements.spec.ts) - Tests

---

## Accessibility Support

### Getting Help
- Check [ACCESSIBILITY.md](./ACCESSIBILITY.md) for feature details
- Review [ACCESSIBILITY_IMPLEMENTATION.md](./ACCESSIBILITY_IMPLEMENTATION.md) for technical info
- Search GitHub Issues for similar topics
- Contact maintainers if issue not found

### Reporting Issues
Please include:
- Description of the problem
- Steps to reproduce
- Expected vs actual behavior
- What assistive technology you're using (if applicable)
- Screenshots or screen reader output

### Contributing
Help make this extension more accessible:
1. Review accessibility issues
2. Test with screen readers
3. Suggest improvements
4. Contribute code or documentation
5. Report bugs and accessibility gaps

---

**Version**: 1.0  
**Last Updated**: 2024  
**Accessibility Level**: WCAG 2.1 Level AA
