module.exports = (auth, ...urls) => new Promise(async res => {
    const responses = await Promise.all(urls.map(url => new Promise(async r => {
        require(`request`).get(`${ctx.keys.mainLocation}/setCachedLocation/${encodeURI(url)}`, {
            headers: { auth }
        }, (e, resp, body) => {
            try {
                if(typeof body == `string`) body = JSON.parse(body)
            } catch(E) {}

            if(e) {
                console.error(`FAILED TO CACHE LOCATION: ${e}`)
                res(false)
            } else if(body && typeof body == `object`) {
                if(!body.success) console.log(`FAILED TO CACHE LOCATION: \n- Success: ${body.success}\n- Message: ${body.message}`);
                res(body.success)
            } else {
                console.error(`FAILED TO CACHE LOCATION: response body is NOT an object, got:`, body);
                res(false)
            }
        })
    })));

    console.log(`Cached ${responses.filter(o => o === true).length}/${responses.length} locations successfully!`);

    res(responses.filter(o => o === true).length/responses.length)
})