const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const url = process.env.PUBLIC_SITE_URL;
  assert.ok(url && url.startsWith('https://'), 'PUBLIC_SITE_URL must be HTTPS');
  const report = {url, startedAt: new Date().toISOString(), passed: false, rolls: [], resources: []};
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || undefined,
      headless: true,
      args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
    });
    const page = await browser.newPage({viewport: {width: 1440, height: 960}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on('response', response => {
      report.resources.push({url: response.url(), status: response.status()});
      if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(`${response.status()} ${response.url()}`);
    });
    let response;
    for (let attempt = 0; attempt < 12; attempt++) {
      response = await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 60000});
      if (response.status() === 200) break;
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    assert.equal(response.status(), 200, 'Published HTML must return 200');
    assert.ok(page.url().startsWith('https://'));
    await page.waitForFunction(() => document.querySelector('.scene')?.dataset.state === 'idle', null, {timeout: 60000});
    await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
    const state = () => page.evaluate(async () => (await import(new URL('./game.js', location.href).href)).getGameState());
    let previous = '';
    for (let i = 0; i < 10; i++) {
      await page.locator('#roll').click();
      assert.equal(await page.locator('#roll').isDisabled(), true);
      assert.equal(await page.locator('.scene').getAttribute('data-state'), 'rolling');
      if (i === 0) await page.waitForFunction(async () => {
        const game = await import(new URL('./game.js', location.href).href);
        return game.getGameState().visibleFaces.every(face => face.height > 0);
      });
      await page.waitForFunction(() => document.querySelector('.scene').dataset.state !== 'rolling', null, {timeout: 30000});
      const current = await state();
      assert.equal(current.state, 'idle');
      assert.equal(current.completedRolls, i + 1);
      assert.equal(await page.locator('#roll').isEnabled(), true);
      assert.equal(current.visibleFaces[0].value, String(current.result.number));
      assert.equal(current.visibleFaces[1].value, current.result.sign);
      assert.ok(current.visibleFaces.every(face => face.alignment > .999 && face.height === 0));
      assert.equal(await page.locator('.result-copy strong').innerText(), String(current.result.number));
      assert.equal(await page.locator('.result-sign').innerText(), current.result.sign);
      const pair = `${current.result.number}${current.result.sign}`;
      assert.notEqual(pair, previous); previous = pair;
      report.rolls.push({number: current.result.number, sign: current.result.sign, matchedPhysicalFaces: true});
    }
    await page.setViewportSize({width: 390, height: 844});
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.ok((await page.locator('#roll').boundingBox()).height >= 44);
    await page.locator('#roll').click();
    await page.waitForFunction(() => document.querySelector('.scene').dataset.state === 'idle', null, {timeout: 30000});
    assert.equal((await state()).completedRolls, 11);
    assert.deepEqual(errors, []);
    report.mobileRollPassed = true;
    report.passed = true;
    console.log('PUBLIC SITE VERIFIED:', url);
    console.log('PASS: HTTPS 200; HTML/CSS/JS/images/local Three.js loaded; 10 animated rolls match physical top faces; no consecutive duplicates; button lock; mobile roll.');
    console.log('Rolls:', report.rolls.map(roll => `${roll.number}${roll.sign}`).join(', '));
  } catch (error) {
    report.error = error.stack;
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync('published-verification.json', JSON.stringify(report, null, 2));
    await browser?.close();
  }
})().catch(error => {console.error(error);process.exitCode = 1;});
