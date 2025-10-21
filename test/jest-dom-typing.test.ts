/// <reference types="@testing-library/jest-dom" />

// Ensure jest-dom matchers are available to TypeScript and runtime
test('jest-dom matchers are available to TypeScript', () => {
  document.body.innerHTML = `<div id="foo">hello</div>`;
  const el = document.getElementById('foo');
  // toBeVisible matcher should be recognized by TypeScript if types configured correctly
  expect(el).toBeVisible();
});
