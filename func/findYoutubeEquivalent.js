module.exports = ({query, title, artist, duration}) => new Promise(async (resolve, rej) => {
    const listA = []

    const search = (s) => new Promise(async res => {
        try {
            var r = await (require(`ytsr`)(s, {limit: 10, safeSearch: false}));
    
            console.log(`${s} (${require('../util').timestampConvert(duration)}) // BEFORE FILTER:`, r.items.map(s => `${s.title} (${s.duration})`));
    
            r.items = r.items.filter(
                v => 
                    typeof v == `object` && 
                    v.type.toLowerCase() == `video` && 
                    (duration ? require('../util').timestampStringToNum(v.duration) < duration+3000 : true) && 
                    (duration ? require('../util').timestampStringToNum(v.duration) > duration-10000 : true)
            );  
            res(r.items)    
        } catch(e) {
            console.log(`failed to search...retrying`)
            try {
                var r = await (require(`ytsr`)(s, {limit: 10, safeSearch: false}));
        
                console.log(`${s} (${require('../util').timestampConvert(duration)}) // BEFORE FILTER:`, r.items.map(s => `${s.title} (${s.duration})`));
        
                r.items = r.items.filter(
                    v => 
                        typeof v == `object` && 
                        v.type.toLowerCase() == `video` && 
                        (duration ? require('../util').timestampStringToNum(v.duration) < duration+3000 : true) && 
                        (duration ? require('../util').timestampStringToNum(v.duration) > duration-10000 : true)
                );  
                res(r.items)    
            } catch(e) {
                console.log(`failed to search...retrying`)
                try {
                    var r = await (require(`ytsr`)(s, {limit: 10, safeSearch: false}));
            
                    console.log(`${s} (${require('../util').timestampConvert(duration)}) // BEFORE FILTER:`, r.items.map(s => `${s.title} (${s.duration})`));
            
                    r.items = r.items.filter(
                        v => 
                            typeof v == `object` && 
                            v.type.toLowerCase() == `video` && 
                            (duration ? require('../util').timestampStringToNum(v.duration) < duration+3000 : true) && 
                            (duration ? require('../util').timestampStringToNum(v.duration) > duration-10000 : true)
                    );  
                    res(r.items)  
                } catch(e) {
                    console.log(`failed to search... resolving with no entries`, e);
                    res([])
                }
            }
        }

    });

    let resolved = 0;

    let addResolved = () => {
        resolved++;
        if(resolved === 3) {
            console.log(`from 3 searches, ${listA.length} results exist.`);

            let newArr = listA.filter( (obj, index, self) => index === self.findIndex((el) => ( el.id === obj.id )) );

            console.log(`without duplicates, there are ${newArr.length} results.`, newArr);

            const obj = {
                artist,
                title,
                duration,
                result: {},
                results: []
            }
    
            if(newArr.length === 0) return res(obj);
    
            for(t of newArr) obj.results.push({
                title: t.title,
                artists: [t.author.name],
                duration: [require('../util').timestampStringToNum(t.duration)],
                url: t.url,
                thumbnail: `https://i3.ytimg.com/vi/${t.id}/maxresdefault.jpg`,
                id: t.videoId,
                source: `YouTube`
            });
    
            const perfect = obj.results.find(t => query ? false : t.title.toLowerCase().includes(title.toLowerCase()) && t.artists[0].toLowerCase().includes(artist.toLowerCase()));
    
            if(perfect) {
                obj.result = perfect;
                console.log(`perfect match`, perfect);
            } else if(obj.results.length > 1) {
                console.log(`taking yt's top result from the match filter.`)
                obj.result = obj.results[0]
            } else {
                console.log(`single match!`)
                obj.result = obj.results[0]
            };
    
            resolve(obj)
        }
    }

    try {
        if(query) {
            search(`"${query}"`).then(r => { listA.push(...r); addResolved() });
            search(`${query} audio`).then(r => { listA.push(...r); addResolved() });
            search(`${query} official audio`).then(r => { listA.push(...r); addResolved() });
        } else {
            search(`${artist} "${title}"`).then(r => { listA.push(...r); addResolved() });
            search(`${artist} - ${title}`).then(r => { listA.push(...r); addResolved() });
            search(`"${title}" audio`).then(r => { listA.push(...r); addResolved() });
        }
    } catch(e) { rej(e) }
})