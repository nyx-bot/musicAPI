const keyFetch = require('./getKeys.js');
const fs = require('fs')
const endpoints = fs.readdirSync(`./lib/`);

module.exports = ({app, auth}) => {
    let spotify;
    
    global.ctx = {
        idGen: function (num) {
            let retVal = "";
            let charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
            var length = 5;
            if (num) {
                length = Math.round(num);
            }
            for (var i = 0, n = charset.length; i < length; ++i) {
                retVal += charset.charAt(Math.floor(Math.random() * n));
            }
            return retVal;
        },
        util: require('./util'),
        cacheLocation: (...urls) => require(`./func/cacheLocation`)(auth, ...urls)
    };
    
    keyUpd = () => new Promise(async (res, rej) => {
        console.log(`fetching keys...`)
        ctx.keys = await keyFetch(ctx.keys);
        console.log(`nyx locations:\n- ${ctx.keys.mainLocation}`);
        res(ctx.keys);
    })
    
    for (f of endpoints) {
        const e = require(`./lib/${f}`)
        app[e.type ? app[e.type.toLowerCase()] ? e.type.toLowerCase() : `get` || `get` : `get`](e.endpoint, (req, res) => e.func(ctx, req, res))
    }
    
    keyUpd().then(() => {
        setInterval(keyUpd, 1.8e+6);

        server = app.listen(1366, function () {
            console.log(`online! port ${server.address().port}; listening to auth key ${auth}`);

            const sendToMainProcess = () => {
                if(global.sendHeartbeat !== false) {
                    //console.log(`Pinging enabled!`)
                    require(`superagent`).get(`${ctx.keys.mainLocation}/registerMusicClient${process.argv.indexOf(`--fallback`) !== -1 ? `?fallback=true` : ``}`).set(`auth`, auth).then(r => {
                        //console.log(`successfully registered musicAPI to nyx!`) // it's 5 seconds, don't spam the console lol
                    }).catch(e => {
                        console.error(`failed to register musicAPI to nyx! (possibly offline?) // ${e}`)
                    })
                } else console.log(`Ping sending is not enabled!`)
            };

            setInterval(sendToMainProcess, 2500); sendToMainProcess();
        
            require('cron').job(`* * * * *`, sendToMainProcess).start(); sendToMainProcess()
        });
    })
}