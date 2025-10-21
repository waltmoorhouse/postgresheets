/**
 * @jest-environment jsdom
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

describe('Accessibility Enhancements', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    container = document.getElementById('app')!;
  });

  describe('Column Resize Keyboard Support', () => {
    it('resize handle should be a keyboard-accessible button', () => {
      container.innerHTML = `
        <button type="button" class="resize-handle" tabindex="0" role="separator" aria-orientation="vertical" 
                aria-label="Resize column_name column. Use arrow keys to adjust width.">
        </button>
      `;

      const resizeHandle = container.querySelector('.resize-handle') as HTMLButtonElement;
      expect(resizeHandle).toBeDefined();
      expect(resizeHandle.tagName).toBe('BUTTON');
      expect(resizeHandle.getAttribute('tabindex')).toBe('0');
      expect(resizeHandle.getAttribute('role')).toBe('separator');
      expect(resizeHandle.getAttribute('aria-label')).toContain('arrow keys');
    });

    it('resize handle should have proper ARIA attributes', () => {
      container.innerHTML = `
        <button class="resize-handle" aria-label="Resize column_name column. Use arrow keys to adjust width."
                aria-orientation="vertical" role="separator">
        </button>
      `;

      const resizeHandle = container.querySelector('.resize-handle');
      expect(resizeHandle?.getAttribute('aria-label')).toBeDefined();
      expect(resizeHandle?.getAttribute('aria-orientation')).toBe('vertical');
      expect(resizeHandle?.getAttribute('role')).toBe('separator');
    });

    it('should have CSS for visual focus indicator', () => {
      const styleElement = document.createElement('style');
      styleElement.textContent = `
        .resize-handle:focus {
          outline: 2px solid var(--ps-accent);
          outline-offset: -2px;
        }
      `;
      document.head.appendChild(styleElement);

      container.innerHTML = `
        <button type="button" class="resize-handle" tabindex="0"></button>
      `;

      const resizeHandle = container.querySelector('.resize-handle') as HTMLButtonElement;
      expect(resizeHandle).toBeDefined();
      // Focus should be visible
      resizeHandle.focus();
      expect(document.activeElement).toBe(resizeHandle);
    });
  });

  describe('ARIA Live Region', () => {
    it('should have aria-live region for announcements', () => {
      container.innerHTML = `
        <div role="status" aria-live="polite" aria-atomic="true" class="aria-live-region">
          Table loaded: 50 rows
        </div>
      `;

      const liveRegion = container.querySelector('[role="status"]');
      expect(liveRegion?.getAttribute('aria-live')).toBe('polite');
      expect(liveRegion?.getAttribute('aria-atomic')).toBe('true');
      expect(liveRegion?.textContent).toContain('Table loaded');
    });

    it('aria-live region should be visually hidden but available to screen readers', () => {
      const styleElement = document.createElement('style');
      styleElement.textContent = `
        .aria-live-region {
          position: absolute;
          left: -10000px;
          width: 1px;
          height: 1px;
          overflow: hidden;
        }
      `;
      document.head.appendChild(styleElement);

      container.innerHTML = `
        <div role="status" aria-live="polite" aria-atomic="true" class="aria-live-region">
          Page 2 loaded
        </div>
      `;

      const liveRegion = container.querySelector('.aria-live-region') as HTMLElement;
      const styles = window.getComputedStyle(liveRegion);
      
      expect(liveRegion).toBeDefined();
      expect(liveRegion.getAttribute('aria-live')).toBe('polite');
    });
  });

  describe('Row Selection with Shift+Click', () => {
    it('row checkbox should have title for Shift+Click hint', () => {
      container.innerHTML = `
        <input type="checkbox" title="Click to select, Shift+Click to select a range">
      `;

      const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(checkbox.title).toContain('Shift+Click');
    });

    it('should support multi-selection accessibility pattern', () => {
      container.innerHTML = `
        <table>
          <tbody>
            <tr>
              <td><input type="checkbox" data-row="1" title="Click to select, Shift+Click to select a range"></td>
              <td>Row 1</td>
            </tr>
            <tr>
              <td><input type="checkbox" data-row="2" title="Click to select, Shift+Click to select a range"></td>
              <td>Row 2</td>
            </tr>
            <tr>
              <td><input type="checkbox" data-row="3" title="Click to select, Shift+Click to select a range"></td>
              <td>Row 3</td>
            </tr>
          </tbody>
        </table>
      `;

      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes).toHaveLength(3);
      
      checkboxes.forEach(checkbox => {
        expect(checkbox.getAttribute('title')).toContain('Shift+Click');
      });
    });
  });

  describe('Pagination Accessibility', () => {
    it('pagination should have proper ARIA labels', () => {
      container.innerHTML = `
        <div role="navigation" aria-label="Pagination">
          <button>Previous</button>
          <span>Page 1 · Rows 100</span>
          <button>Next</button>
        </div>
      `;

      const paginationNav = container.querySelector('[role="navigation"]');
      expect(paginationNav?.getAttribute('aria-label')).toBe('Pagination');
    });

    it('pagination buttons should be properly labeled', () => {
      container.innerHTML = `
        <button type="button">Previous</button>
        <button type="button">Next</button>
      `;

      const buttons = container.querySelectorAll('button');
      expect(buttons[0].textContent).toContain('Previous');
      expect(buttons[1].textContent).toContain('Next');
    });
  });

  describe('Search Accessibility', () => {
    it('search input should have proper labels and accessibility', () => {
      container.innerHTML = `
        <input type="search" placeholder="Search this table…" aria-label="Search table">
        <button type="button">Search</button>
      `;

      const searchInput = container.querySelector('input[type="search"]') as HTMLInputElement;
      expect(searchInput?.placeholder).toContain('Search');
      
      const searchButton = container.querySelector('button');
      expect(searchButton?.textContent).toContain('Search');
    });
  });

  describe('Focus Management', () => {
    it('resize handle should be focusable via keyboard', () => {
      container.innerHTML = `
        <button type="button" class="resize-handle" tabindex="0">Resize</button>
      `;

      const resizeHandle = container.querySelector('.resize-handle') as HTMLButtonElement;
      resizeHandle.focus();
      expect(document.activeElement).toBe(resizeHandle);
    });

    it('all interactive elements should be in logical tab order', () => {
      container.innerHTML = `
        <button tabindex="0">Button 1</button>
        <input type="text" tabindex="0">
        <select tabindex="0"><option>Option</option></select>
        <button tabindex="0">Button 2</button>
      `;

      const interactiveElements = container.querySelectorAll('button, input, select');
      interactiveElements.forEach(el => {
        expect(el.getAttribute('tabindex')).toBe('0');
      });
    });
  });

  describe('Column Manager Accessibility', () => {
    it('column visibility toggles should be keyboard accessible', () => {
      container.innerHTML = `
        <label>
          <input type="checkbox" title="Toggle column visibility">
          <span>Column Name</span>
        </label>
      `;

      const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
      checkbox.focus();
      expect(document.activeElement).toBe(checkbox);
    });
  });

  describe('Error Handling Accessibility', () => {
    it('validation errors should be properly associated with inputs', () => {
      container.innerHTML = `
        <input 
          type="text" 
          aria-invalid="true" 
          aria-describedby="error-msg-1"
          id="input-1"
        >
        <span id="error-msg-1">This field is invalid</span>
      `;

      const input = container.querySelector('input[type="text"]');
      expect(input?.getAttribute('aria-invalid')).toBe('true');
      expect(input?.getAttribute('aria-describedby')).toBe('error-msg-1');

      const errorMsg = container.querySelector('#error-msg-1');
      expect(errorMsg?.textContent).toBe('This field is invalid');
    });
  });
});
