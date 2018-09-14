import { seconds, trim } from 'utils/strings';
import { PlayerError, MSG_CAPTIONS_LOAD_FAILED } from 'api/errors';

// Component that loads and parses an DFXP file

export default function Dfxp(xmlDoc) {
    if (!xmlDoc) {
        parseError(306103);
    }

    const _captions = [];
    let paragraphs = xmlDoc.getElementsByTagName('p');
    // Default frameRate is 30
    let frameRate = 30;
    const tt = xmlDoc.getElementsByTagName('tt');
    if (tt && tt[0]) {
        const parsedFrameRate = parseFloat(tt[0].getAttribute('ttp:frameRate'));
        if (!isNaN(parsedFrameRate)) {
            frameRate = parsedFrameRate;
        }
    }

    if (!paragraphs) {
        parseError(306101);
    }
    if (!paragraphs.length) {
        paragraphs = xmlDoc.getElementsByTagName('tt:p');
        if (!paragraphs.length) {
            paragraphs = xmlDoc.getElementsByTagName('tts:p');
        }
    }

    for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];

        const breaks = p.getElementsByTagName('br');
        for (let j = 0; j < breaks.length; j++) {
            const b = breaks[j];
            b.parentNode.replaceChild(xmlDoc.createTextNode('\r\n'), b);
        }

        const rawText = (p.innerHTML || p.textContent || p.text || '');
        const text = trim(rawText).replace(/>\s+</g, '><').replace(/(<\/?)tts?:/g, '$1').replace(/<br.*?\/>/g, '\r\n');
        if (text) {
            const begin = p.getAttribute('begin');
            const dur = p.getAttribute('dur');
            const end = p.getAttribute('end');

            const entry = {
                begin: seconds(begin, frameRate),
                text: text
            };
            if (end) {
                entry.end = seconds(end, frameRate);
            } else if (dur) {
                entry.end = entry.begin + seconds(dur, frameRate);
            }
            _captions.push(entry);
        }
    }
    if (!_captions.length) {
        parseError(306101);
    }
    return _captions;
}

function parseError(code) {
    throw new PlayerError(MSG_CAPTIONS_LOAD_FAILED, code);
}
