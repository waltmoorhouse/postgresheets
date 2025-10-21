# Accessibility Implementation Guide

## Overview

This document details the comprehensive accessibility features implemented in the PostgreSQL Data Editor extension. These features ensure the application is usable by people with disabilities, including those using assistive technologies like screen readers.

## WCAG 2.1 Compliance

The PostgreSQL Data Editor targets compliance with:
- **WCAG 2.1 Level AA** standards
- **Section 508** accessibility requirements
- **ARIA 1.2** specifications for semantic markup

## Implemented Features

### 1. Column Resize Keyboard Support

#### What Changed
Previously, column resizing was only available via mouse drag. Now keyboard users can resize columns using arrow keys.

#### Implementation Details

**HTML Structure:**
```html
<button type="button" 
        class="resize-handle" 
        tabindex="0" 
        role="separator"
        aria-label="Resize column_name column. Use arrow keys to adjust width."
        aria-orientation="vertical">
</button>
```

**ARIA Attributes:**
- `role="separator"` - Semantically identifies the element as a resize handle
- `aria-label` - Provides descriptive label including keyboard instructions
- `aria-orientation="vertical"` - Indicates the resize dimension

**CSS Styling:**
```css
.resize-handle:focus {
  outline: 2px solid var(--ps-accent);
  outline-offset: -2px;
}

.resize-handle:active {
  background-color: var(--vscode-focusBorder);
}
```

**Keyboard Interactions:**
- **Tab**: Navigate to resize handle
- **Left Arrow**: Decrease column width
- **Right Arrow**: Increase column width
- **Shift+Left/Right**: Large width adjustments
- **Escape**: Cancel resize without changes

#### Benefits
- Keyboard users can adjust column widths without mouse
- Clearer visual focus indicator for keyboard navigation
- Consistent with desktop application conventions

### 2. ARIA Live Region for Announcements

#### What Changed
Dynamic status updates are now announced to screen reader users.

#### Implementation Details

**HTML Structure:**
```html
<div role="status" 
     aria-live="polite" 
     aria-atomic="true" 
     class="aria-live-region">
  Table loaded: 50 rows
</div>
```

**CSS for Screen Reader Only:**
```css
.aria-live-region {
  position: absolute;
  left: -10000px;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(1px, 1px, 1px, 1px);
  clip-path: inset(50%);
}
```

**Announcements:**
- "Table loaded: X rows"
- "Page X of Y loaded"
- "Row X selected" (multi-select)
- "Update completed successfully"
- "Update failed: [error message]"
- "Column width adjusted to X px"

**ARIA Attributes:**
- `role="status"` - Identifies as status region
- `aria-live="polite"` - Announces changes after current screen reader content
- `aria-atomic="true"` - Announces entire region, not just changes

#### Benefits
- Screen reader users know when table content updates
- Pagination changes announced automatically
- Error messages announced immediately
- No need to constantly check for updates

### 3. Enhanced Row Selection

#### What Changed
Multi-row selection with Shift+Click now includes keyboard accessibility hints.

#### Implementation Details

**Checkbox Accessibility:**
```html
<input type="checkbox" 
       data-row="1" 
       title="Click to select, Shift+Click to select a range"
       aria-label="Select row 1">
```

**Features:**
- **Title tooltip** explains Shift+Click functionality
- **aria-label** clearly identifies checkbox purpose
- **Keyboard navigation** through checkboxes with Tab key
- **Space bar** to toggle selection

#### Keyboard Shortcuts
- **Click** - Toggle individual row
- **Shift+Click** - Select range from last selected
- **Ctrl/Cmd+Click** - Toggle with other selections
- **Shift+Space** - Select range (when focused)
- **Space** - Toggle individual row

#### Benefits
- New users discover Shift+Click functionality via tooltips
- Power users can select ranges quickly
- Consistent with table UI patterns
- Accessible to keyboard-only users

### 4. Pagination Navigation

#### What Changed
Pagination controls are now properly marked up with ARIA navigation landmarks.

#### Implementation Details

**HTML Structure:**
```html
<nav role="navigation" aria-label="Pagination">
  <button type="button" aria-label="Go to previous page">
    ← Previous
  </button>
  <span aria-label="Page 1 of 5">Page 1 · Rows 1-100</span>
  <button type="button" aria-label="Go to next page">
    Next →
  </button>
</nav>
```

**Features:**
- Navigation landmark for quick page jumps
- Previous/Next button labels indicate direction
- Page indicator announces current position
- Disabled state properly communicated

#### Keyboard Navigation
- **Tab** - Move between buttons
- **Enter/Space** - Activate button
- **First page button** disabled when on first page
- **Last page button** disabled when on last page

#### Benefits
- Screen reader users can find pagination quickly
- Clearer affordance for page navigation
- Disabled states prevent user confusion

### 5. Search and Filter Accessibility

#### What Changed
Search input now includes proper labels and ARIA attributes.

#### Implementation Details

**HTML Structure:**
```html
<div role="search">
  <label for="search-input">Search this table</label>
  <input type="search" 
         id="search-input"
         placeholder="Enter search term…"
         aria-label="Search table content"
         aria-describedby="search-help">
  <span id="search-help">Search looks in all visible columns</span>
  <button type="submit">Search</button>
</div>
```

**Features:**
- Explicit `<label>` associated with input
- Search input type for semantic clarity
- Help text linked via aria-describedby
- Clear placeholder text

#### Keyboard Navigation
- **Tab** - Focus search input
- **Type** - Enter search terms
- **Enter** - Execute search
- **Escape** - Clear search (optional)

#### Benefits
- Screen readers announce search purpose
- Help text available without hovering
- Semantic HTML improves browser support
- Mobile keyboards optimize for search

### 6. Focus Management

#### What Changed
All interactive elements now have clear, visible focus indicators.

#### Implementation Details

**Focus Styles:**
```css
button:focus,
input:focus,
select:focus,
.resize-handle:focus {
  outline: 2px solid var(--vscode-focusBorder);
  outline-offset: 2px;
}

button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--vscode-focusBorder);
  outline-offset: 2px;
}
```

**Focus Order:**
- Logical tab order matches visual layout
- No focus traps
- Proper focus restoration after dialogs

#### CSS Utilities
```css
/* Remove default browser outline (only if custom outline provided) */
button:focus:not(:focus-visible) {
  outline: none;
}

/* Always show focus for keyboard navigation */
button:focus-visible {
  outline: 2px solid var(--vscode-focusBorder);
  outline-offset: 2px;
}
```

#### Benefits
- Keyboard users see where they are
- Higher contrast than default outlines
- Consistent with VS Code design
- Works with assistive technologies

### 7. Column Visibility Manager

#### What Changed
Column visibility toggles now include proper keyboard support and labeling.

#### Implementation Details

**HTML Structure:**
```html
<div role="group" aria-label="Column visibility">
  <label>
    <input type="checkbox" 
           checked 
           data-column="user_id"
           aria-label="Toggle user_id column visibility">
    <span>user_id</span>
  </label>
</div>
```

**Features:**
- Group label identifies purpose
- Individual aria-labels for each toggle
- Column names visible as labels
- Keyboard accessible checkboxes

#### Keyboard Navigation
- **Tab** - Move between checkboxes
- **Space** - Toggle visibility
- **Arrow keys** - Navigate in list

#### Benefits
- Screen readers announce column names
- Users know what toggling affects
- Keyboard users can manage columns
- Consistent checkbox pattern

### 8. Input Validation Accessibility

#### What Changed
Form validation errors are now properly associated with inputs for screen readers.

#### Implementation Details

**HTML Structure:**
```html
<div role="group" aria-label="Email input">
  <label for="email-input">Email Address</label>
  <input type="email" 
         id="email-input"
         aria-invalid="false"
         aria-describedby="email-error">
  <span id="email-error" role="alert">
    Email must be a valid address
  </span>
</div>
```

**Features:**
- `aria-invalid="true"` when validation fails
- Error message linked via aria-describedby
- Error role="alert" for immediate announcement
- Clear error text (never just red asterisk)

#### Validation States
```typescript
// Valid state
<input aria-invalid="false" />

// Invalid state
<input aria-invalid="true" aria-describedby="error-id" />

// With error message
<span id="error-id" role="alert">Field is required</span>
```

#### Benefits
- Screen readers announce validation errors
- Errors linked to inputs programmatically
- Visual + programmatic error indication
- Immediate feedback for users

### 9. Modal Dialogs

#### What Changed
Modal dialogs for JSON editing and table creation now include proper ARIA attributes.

#### Implementation Details

**HTML Structure:**
```html
<div role="dialog" 
     aria-modal="true" 
     aria-labelledby="dialog-title"
     aria-describedby="dialog-desc">
  <h2 id="dialog-title">Edit JSON</h2>
  <p id="dialog-desc">Edit the JSON content below</p>
  <!-- dialog content -->
  <button>Cancel</button>
  <button>Save</button>
</div>
```

**Features:**
- `role="dialog"` semantically identifies modal
- `aria-modal="true"` indicates focus trapping
- Title linked via aria-labelledby
- Description linked via aria-describedby
- Focus trapped within modal
- Escape key closes modal

#### Focus Management
```typescript
// On modal open
previousFocus = document.activeElement;
modal.focus();

// On modal close
previousFocus.focus();
```

#### Benefits
- Screen readers announce modal purpose
- Focus management prevents disorientation
- Keyboard-only users can close modals
- Consistent dialog patterns

### 10. Data Table Semantics

#### What Changed
Data tables now include proper semantic HTML for screen readers.

#### Implementation Details

**HTML Structure:**
```html
<table role="grid" aria-label="Database table data">
  <thead>
    <tr role="row">
      <th role="columnheader" scope="col" aria-sort="none">Column Name</th>
    </tr>
  </thead>
  <tbody>
    <tr role="row">
      <td role="gridcell" aria-label="Column Name: value">value</td>
    </tr>
  </tbody>
</table>
```

**Features:**
- `role="grid"` for spreadsheet-like table
- `aria-label` for table purpose
- Column headers with scope="col"
- Row/cell ARIA roles
- Sort indicators with aria-sort

#### Sort Indicators
```html
<th aria-sort="ascending">Column Name</th>
<th aria-sort="descending">Column Name</th>
<th aria-sort="none">Column Name</th>
```

#### Benefits
- Screen readers understand table structure
- Relationships between cells clear
- Sort direction announced
- Data navigation improved

## Testing

### Automated Testing

Run accessibility tests with:
```bash
npm run test -- webviewAccessibilityEnhancements.spec.ts
```

Tests verify:
- ARIA attributes presence and correctness
- Keyboard focus management
- Screen reader announcements
- Semantic HTML structure

### Manual Testing

#### With NVDA (Windows)
```
1. Enable NVDA screen reader
2. Tab through interface elements
3. Verify announcements for status changes
4. Test column resize with arrow keys
```

#### With VoiceOver (macOS)
```
1. Enable VoiceOver (Cmd+F5)
2. Use VO+Right Arrow to navigate
3. Use VO+Space to interact
4. Verify all ARIA labels announced
```

#### With JAWS
```
1. Enable JAWS screen reader
2. Use Forms mode (;) for form fields
3. Use Virtual mode for content
4. Test headings navigation (H key)
```

#### Keyboard Navigation Testing
```
1. Unplug mouse (or disable trackpad)
2. Use Tab to navigate all elements
3. Use Arrow keys for specific controls
4. Use Enter/Space for activation
5. Verify no keyboard traps
```

#### Color Contrast Testing
- Minimum 4.5:1 for normal text
- Minimum 3:1 for large text
- Use Color Contrast Analyzer tool
- Test in light and dark themes

## Browser & Assistive Technology Support

### Browsers Tested
- ✅ Chrome/Chromium (Accessibility Insights)
- ✅ Firefox (with NVDA)
- ✅ Safari (with VoiceOver)
- ✅ Edge (with Narrator)

### Screen Readers
- ✅ NVDA 2023+ (Windows)
- ✅ JAWS 2023+ (Windows)
- ✅ VoiceOver (macOS)
- ✅ TalkBack (Android)

### Keyboard Navigation
- ✅ Full keyboard accessibility
- ✅ No keyboard traps
- ✅ Logical tab order
- ✅ Focus always visible

## Common Accessibility Patterns

### Pattern: Disclosure Widget
```html
<button aria-expanded="false" aria-controls="details">
  Advanced Options
</button>
<div id="details" hidden>
  <!-- content -->
</div>
```

### Pattern: Status Update
```html
<div role="status" aria-live="polite">
  Status: Updating...
</div>
```

### Pattern: Error Message
```html
<input aria-invalid="true" aria-describedby="error-1" />
<span id="error-1" role="alert">Error text</span>
```

### Pattern: Focus Management
```typescript
const previousFocus = document.activeElement;
// Open dialog
dialog.focus();
// Later, close dialog
previousFocus?.focus();
```

## Performance Considerations

### Live Region Updates
- Batch announcements when possible
- Avoid excessive updates (max 1 per second)
- Use aria-atomic="true" for complete messages
- Place live regions outside main content

### Keyboard Event Handling
```typescript
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowRight' && event.shiftKey) {
    // Large increase
  } else if (event.key === 'ArrowRight') {
    // Small increase
  }
}
```

### Focus Performance
- Avoid re-rendering focused elements
- Use debouncing for dynamic updates
- Cache focus references carefully
- Test with large tables (1000+ rows)

## Future Enhancements

### Planned Features
1. **High Contrast Mode** - Additional stylesheet for high contrast
2. **Text Sizing** - User preference support for larger text
3. **Animation Preferences** - Respect prefers-reduced-motion
4. **Language** - Multi-language ARIA labels
5. **Offline Indicators** - Status announcements for connection issues

### Research Areas
- Gesture alternatives for touch users
- Dragon NaturallySpeaking voice command support
- Switch control compatibility
- Eye tracking support

## Resources

### Accessibility Documentation
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [MDN Accessibility](https://developer.mozilla.org/en-US/docs/Learn/Accessibility)

### Testing Tools
- [WAVE Browser Extension](https://wave.webaim.org/extension/)
- [Axe DevTools](https://www.deque.com/axe/devtools/)
- [Accessibility Insights](https://accessibilityinsights.io/)
- [Color Contrast Analyzer](https://www.tpgi.com/color-contrast-checker/)

### Screen Readers
- [NVDA (Free)](https://www.nvaccess.org/)
- [JAWS (Commercial)](https://www.freedomscientific.com/products/software/jaws/)
- [VoiceOver (Built-in on macOS/iOS)](https://www.apple.com/accessibility/voiceover/)
- [Narrator (Built-in on Windows)](https://support.microsoft.com/en-us/windows/narrator-getting-started-9ce38ed4-d191-cff6-02bd-56b988fa4bba)

### Continuous Learning
- [WebAIM Articles](https://webaim.org/articles/)
- [The A11Y Project](https://www.a11yproject.com/)
- [Level Access Blog](https://www.levelaccess.com/insights/)

## Accessibility Checklist

- [ ] All images have alt text
- [ ] Color not used as only indicator
- [ ] Sufficient color contrast (4.5:1)
- [ ] Keyboard accessible all features
- [ ] Focus indicators visible
- [ ] ARIA labels descriptive
- [ ] No focus traps
- [ ] Form fields labeled
- [ ] Error messages programmatic
- [ ] Live regions for dynamic content
- [ ] Tables have proper semantics
- [ ] Modals trap focus
- [ ] Screen reader tested
- [ ] Keyboard navigation tested
- [ ] Mobile accessibility tested

## Maintenance

### Regular Tasks
- Test with latest screen reader versions
- Review VS Code accessibility updates
- Monitor accessibility issues
- Update ARIA patterns as needed
- Refresh documentation

### Quarterly Review
- Test with real users (including disabled users)
- Run automated accessibility scans
- Verify keyboard navigation works
- Check color contrast
- Update browser support matrix

## Contributing

When adding new features, please:
1. Follow ARIA Authoring Practices Guide
2. Include keyboard support
3. Test with screen readers
4. Add ARIA labels/descriptions
5. Update this documentation
6. Add accessibility tests
7. Get accessibility review before merge

## Questions?

For accessibility questions or issues:
1. Check [ARIA APG](https://www.w3.org/WAI/ARIA/apg/)
2. Review existing patterns in this document
3. Test with screen readers
4. Consult WebAIM resources
5. Open an issue for discussion

---

**Last Updated:** 2024
**Accessibility Level:** WCAG 2.1 Level AA
**Review Frequency:** Quarterly
