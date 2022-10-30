const searchFunc = ({query, duration, keys}) => new Promise(async (res, rej) => {
    require('superagent')
        .get(
            `https://api-v2.soundcloud.com/search/tracks?client_id=${
                keys.sc
            }&q=${encodeURI(query)}&limit=20`
        )
        .then((r) => r.body.collection)
        .then(async (r) => {
            let results = [];

            r.filter(v => 
                typeof v == `object` && 
                (duration ? v.duration < duration+3000 : v.duration === v.full_duration) && 
                (duration ? v.duration > duration-10000 : v.duration === v.full_duration)
            ).forEach(async (res) => {
                let dur = [res.duration];
                if(res.duration !== res.full_duration) {dur.push(res.full_duration)}
                let title = res.title,
                    artists = [res.user.username],
                    duration = dur,
                    url = res.permalink_url,
                    thumbnail = null,
                    id = res.urn;
                    if(res.artwork_url) {thumbnail = res.artwork_url.replace('-original', '-t500x500')}
                results.push({
                    title,
                    artists,
                    duration,
                    url,
                    thumbnail,
                    id,
                    source: `SoundCloud`,
                    from: `sc`,
                });
            });
            res(results);
        })
        .catch((e) => {
            console.log(e);
            res([]);
        });
});

module.exports = ({
    title, artist, duration, keys
}) => new Promise(async res => {
    let search = [ `${title}` ];

    if(artist) {
        if(typeof artist == `object` && artist.length) {
            artist.forEach(a => {
                if(a.includes(` `)) {
                    search.unshift(`${a} ${title}`)
                    search.push(...a.split(` `).map(ar => `${ar} ${title}`))
                } else {
                    search.unshift(`${a} ${title}`)
                }
            })
        } else {
            if(artist.includes(` `)) {
                search.unshift(`${artist} ${title}`)
                search.push(...artist.split(` `).map(a => `${a} ${title}`))
            } else {
                search.unshift(`${artist} ${title}`)
            }
        }
    };

    console.log(`[generalSong/SC] Searching ${search.length} queries`, search);

    let results = await Promise.all([
        ...search.map(q => new Promise(async res => {
            console.log(`[generalSong/SC] searching for ${q}...`);
            searchFunc({query: q, duration: require(`../../util`).time(duration).units.ms, keys}).then(r => {
                console.log(`[generalSong/SC] found ${r.length} results`);
                res(r)
            })
        }))
    ])

    return res(results)
})