const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    page.on('requestfailed', request => {
        console.log('REQUEST FAILED:', request.url(), request.failure().errorText);
    });
    page.on('response', response => {
        if (!response.ok()) {
            console.log('RESPONSE NOT OK:', response.url(), response.status());
        }
    });

    await page.goto('http://localhost:5173', {waitUntil: 'networkidle0'});
    
    try {
        await page.type('input[placeholder="New Case Title"]', 'AutoTest');
        let buttons = await page.$$('button');
        for (let btn of buttons) {
            const text = await page.evaluate(el => el.textContent, btn);
            if (text === 'Create') {
                await btn.click();
                break;
            }
        }
        
        await new Promise(r => setTimeout(r, 1000));
        
        const divs = await page.$$('div');
        for (let div of divs) {
            const text = await page.evaluate(el => el.textContent, div);
            if (text.includes('AutoTest')) {
                await div.click();
                break;
            }
        }

        await new Promise(r => setTimeout(r, 1000));
        
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
            await fileInput.uploadFile('d:/Project Resume/ForenSight/backend/test.jpg');
        }
        
        buttons = await page.$$('button');
        for (let btn of buttons) {
            const text = await page.evaluate(el => el.textContent, btn);
            if (text.includes('Securely Acquire Evidence')) {
                await btn.click();
                console.log("Clicked Upload");
                break;
            }
        }

        await new Promise(r => setTimeout(r, 2000));
        
        buttons = await page.$$('button');
        for (let btn of buttons) {
            const text = await page.evaluate(el => el.textContent, btn);
            if (text.includes('Run Analysis')) {
                await btn.click();
                console.log("Clicked Run Analysis");
                break;
            }
        }

        await new Promise(r => setTimeout(r, 2000));
        
    } catch(e) {
        console.log('INTERACTION ERROR:', e.message);
    }
    await browser.close();
})();
