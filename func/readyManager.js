module.exports = () => {
    const EventEmitter = require('events');
    let emitter = new EventEmitter(), ready = false;

    let tmprdy = {
        pending: [],
        finished: [],
        total: 0,
        complete: 0,
        asyncReady: (...names) => new Promise(async res => {
            let called = process.uptime(); 
            if(names.length === 1 && typeof names[0] == `object` && names[0].length) names = names[0]; names = names.filter(s => typeof s == `string`)
            let total = names.length, ready = 0, readies = [];
            if(total === 0) return res(null);
            names.forEach(async name => {
                const ser = (r) => {
                    ready++;
                    const e = {
                        name,
                        readyAt: process.uptime(),
                        readyAtMs: this.readyAt*1000,
                        readyStamp: Date.now(),
                        timeTakenSinceCalled: called - r.readyAt,
                    }; readies.push(e);
                    if(console.d) console.d(`Multi-await asyncReady progress holding "${names.slice(0, names.length-2).join(`", "`)}" and "${names[names.length-1]}" has progress of: ${ready} / ${total} ready.`)
                    if(ready === total) res(readies)
                }; 
                const c = tmprdy.finished.find(n => n[0].toLowerCase() == name.toLowerCase());
                if(console.d) console.d(`asyncReady called from readyHandler object on "${name}" being ${c ? `a task that has completed ${Math.round(called - c[1].readyAt)}s ago.` : tmprdy.pending.find(n => n.toLowerCase() == name.toLowerCase()) ? `a pending task.` : `a task that has not yet been added.`}`)
                if(!c) {
                    emitter.once(`${name}-ready`, r => {
                        r.timeTakenSinceCalled = called - r.readyAt
                        if(console.d) console.d(`${name} has switched state to ready! resolving previously called asyncReady. (taken to resolve since call: ${r.timeTakenSinceCalled}s)`);
                        total === 1 ? res(r) : ser(r);
                    })
                } else total === 1 ? res(r) : ser(r);
            })
        }),
        add: name => {
            tmprdy.total++;
            tmprdy.pending.push(name)
            if(console.d) console.d(`Added pending task for ready: "${name}"`);
            if(console.d) console.d(`Ready event waiting on ${tmprdy.pending.length} current tasks, with total processed being ${tmprdy.complete}/${tmprdy.total}`);
            return {
                finish: () => tmprdy.done(name)
            }
        },
        done: name => {
            const existsIndex = tmprdy.pending.map(s => s.toLowerCase()).indexOf(name.toLowerCase())
            if(console.d) console.d(`Done function called for task "${name}" which ${existsIndex ? `has been registered as pending!` : `has NOT been registered as pending`}`)
            if(tmprdy.pending.find(s => s.toLowerCase() == name.toLowerCase())) {
                const doneAt = {
                    readyAt: process.uptime(),
                    readyAtMs: tmprdy.readyAt*1000,
                    readyStamp: Date.now()
                }; emitter.emit(`${name}-ready`, doneAt);
                if(console.d) console.d(`Task "${name}" was in the pending list!`);
                tmprdy.pending.splice(existsIndex, 1);
                tmprdy.finished.push([name, doneAt]); tmprdy.complete = tmprdy.finished.length;
                if(console.d) console.d(`Successfully removed task "${name}" from the pendling list!`)
                if(console.d) console.d(`Ready event waiting on ${tmprdy.pending.length} current tasks, with total processed being ${tmprdy.done}/${tmprdy.total}`);
                if(tmprdy.pending.length === 0) {
                    ready = {
                        readyAt: process.uptime(),
                        readyAtMs: tmprdy.readyAt*1000,
                        readyStamp: Date.now()
                    }; emitter.emit(`ready`, ready)
                }
            }
        }
    }; if(console.d) console.d(`readyHandler started!`); 
    
    return tmprdy;
}