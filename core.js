const core = {};

const spawnAutoRestart = (restart, time) => new Promise(async res => setTimeout(async () => {
    console.log(`fb autorestart time!`);
    restart().then(res)
}, time))

core.spawnFallback = async (autoRestart) => new Promise(async res => {
    let runningProc, pendingRestart = false;

    const restart = () => new Promise(async res => {
        if(runningProc) {
            pendingRestart = true;
            console.log(`Set pending restart to true!`);

            require('request').get(`http://127.0.0.1:1366/stopSendingPings`, {}, (e, r) => {
                console.log(`Told fallback process to stop sending pings! (${r.statusCode})`)
            });

            runningProc.once(`close`, res)
        } else {
            console.warn(`There is no running fallback process to close, returning...`)
            res(false)
        }
    })

    res({ restart })

    while(true) await new Promise(async res => {
        runningProc = require('child_process').spawn(`node`, [
            `server`, 
            ...process.argv.slice(2).filter(s => s != `main`), 
            `--mainLocation=http://127.0.0.1:1400`, 
            `debug`
        ]);

        if(autoRestart) {
            const time = 1.8e+6

            console.log(`Restarting fallback process in ${require('./util').time(time).string}`)
            spawnAutoRestart(restart, time) // restart every 30 mins
        }

        let ready = false;
        let pendingRestartTimer = null;

        const filter = (d) => {
            d = d.toString().trim()

            blockedStrings = [
                "Checking for updates...",
                "Did not fetch updates -- sendPings is disabled",
                "Ping sending is not enabled!"
            ]

            if(blockedStrings.indexOf(d) != -1) {
                return false
            } else return true;
        }

        const pendingRestartFunc = () => {
            //console.log(`pendingRestart timer`)
            if(pendingRestart === true) {
                runningProc.kill("SIGINT")
            } else pendingRestartTimer = setInterval(() => {
                //console.log(`pendingRestart interval`)
                if(pendingRestart === true) {
                    runningProc.kill("SIGINT")
                }
            }, 1000)
        };

        pendingRestartTimer = setTimeout(pendingRestartFunc, 20000)
    
        runningProc.stdout.on(`data`, d => {
            if(!ready && d.toString().includes(`online`)) ready = true;

            if(filter(d)) {
                if(pendingRestartTimer) clearTimeout(pendingRestartTimer);
                pendingRestartTimer = setTimeout(pendingRestartFunc, 20000)

                if(ready) console.log(`FB | ` + d.toString().trim().split(`\n`).join(`\nFB | `))
            }
        });

        runningProc.stderr.on(`data`, d => {
            console.error(`FB | ` + d.toString().trim().split(`\n`).join(`\nFB | `))
        });

        runningProc.on(`close`, (code, signal) => {
            console.log(`FB PROCESS CLOSED -- CODE ${code}`);
            res()
        })
    })
})

module.exports = core;