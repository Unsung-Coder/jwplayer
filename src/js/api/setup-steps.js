import { PLAYLIST_LOADED, ERROR } from 'events/events';
import PlaylistLoader from 'playlist/loader';
import Playlist, { filterPlaylist, validatePlaylist } from 'playlist/playlist';
import ScriptLoader from 'utils/scriptloader';
import { bundleContainsProviders } from 'api/core-loader';
import { composePlayerError,
    SETUP_ERROR_LOADING_PLAYLIST, SETUP_ERROR_LOADING_PROVIDER } from 'api/errors';
import { getLanguage, formatLanguageCode, loadJsonTranslation, isTranslationAvailable } from 'utils/language';
import en from 'assets/translations/en.js';

export function loadPlaylist(_model) {
    const playlist = _model.get('playlist');
    return new Promise((resolve, reject) => {
        if (typeof playlist !== 'string') {
            const feedData = _model.get('feedData') || {};
            setPlaylistAttributes(_model, playlist, feedData);
            return resolve();
        }
        const playlistLoader = new PlaylistLoader();
        playlistLoader.on(PLAYLIST_LOADED, function(data) {
            const loadedPlaylist = data.playlist;
            delete data.playlist;
            setPlaylistAttributes(_model, loadedPlaylist, data);
            resolve();
        });
        playlistLoader.on(ERROR, e => {
            setPlaylistAttributes(_model, [], {});
            reject(composePlayerError(e, SETUP_ERROR_LOADING_PLAYLIST));
        });
        playlistLoader.load(playlist);
    });
}

function setPlaylistAttributes(model, playlist, feedData) {
    const attributes = model.attributes;
    attributes.playlist = Playlist(playlist);
    attributes.feedData = feedData;
}

function loadProvider(_model) {
    return loadPlaylist(_model).then(() => {
        if (destroyed(_model)) {
            return;
        }

        // Loads the first provider if not included in the core bundle
        // A provider loaded this way will not be set upon completion
        const playlist = filterPlaylist(_model.get('playlist'), _model);
        _model.attributes.playlist = playlist;

        // Throw exception if playlist is empty
        try {
            validatePlaylist(playlist);
        } catch (e) {
            e.code += SETUP_ERROR_LOADING_PLAYLIST;
            throw e;
        }

        const providersManager = _model.getProviders();
        const { provider, name } = providersManager.choose(playlist[0].sources[0]);

        // If provider already loaded or a locally registered one, return it
        if (typeof provider === 'function') {
            return provider;
        }

        if (bundleContainsProviders.html5 && name === 'html5') {
            return bundleContainsProviders.html5;
        }
        return providersManager.load(name)
            .catch(e => {
                throw composePlayerError(e, SETUP_ERROR_LOADING_PROVIDER);
            });
    });
}

function isSkinLoaded(skinPath) {
    const ss = document.styleSheets;
    for (let i = 0, max = ss.length; i < max; i++) {
        if (ss[i].href === skinPath) {
            return true;
        }
    }
    return false;
}

function loadSkin(_model) {
    const skinUrl = _model.get('skin') ? _model.get('skin').url : undefined;
    if (typeof skinUrl === 'string' && !isSkinLoaded(skinUrl)) {
        const isStylesheet = true;
        const loader = new ScriptLoader(skinUrl, isStylesheet);
        return loader.load().catch(error => {
            return error;
        });
    }
    return Promise.resolve();
}

function loadTranslations(_model) {
    const language = getLanguage();
    const customizedLocalization = getCustomizedLocalization(_model, language);
    return new Promise(resolve => {
        if (!isTranslationAvailable(language) || customizationIsComplete(customizedLocalization)) {
            return resolve();
        }
        return loadJsonTranslation(_model.attributes.base, language)
            .then(({ response }) => resolve(response))
            .catch(() => {
                // TODO: trigger warning (JW8-2244)
                resolve();
            });
    }).then(response => {
        if (destroyed(_model)) {
            return;
        }
        setupLocalization(_model, customizedLocalization, response);
    });

}

function customizationIsComplete(customizedLocalization) {
    const defaultFields = Object.keys(en);
    return Object.keys(customizedLocalization).length >= defaultFields.length &&
        defaultFields.every(key => customizedLocalization[key]);
}

function getCustomizedLocalization({ attributes }, languageAndCountryCode) {
    const formattedLanguageCode = formatLanguageCode(languageAndCountryCode);
    return Object.assign({}, attributes.setupConfig.localization, attributes.intl[formattedLanguageCode], attributes.intl[languageAndCountryCode]);
}

function setupLocalization(_model, customizedLocalization, translation) {
    _model.attributes.localization = Object.assign({}, en, translation, customizedLocalization);
}

function destroyed(_model) {
    return _model.attributes._destroyed;
}

const startSetup = function(model, api, promises) {
    if (destroyed(model)) {
        return Promise.reject();
    }
    return Promise.all(promises.concat([
        loadProvider(model),
        loadSkin(model),
        loadTranslations(model)
    ]));
};

export default startSetup;
