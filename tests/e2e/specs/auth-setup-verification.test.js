/* eslint-env node */
/* global page, jestPuppeteer */

/* eslint-disable no-console */

/**
 * WordPress dependencies
 */
import { activatePlugin, createURL, visitAdminPage } from '@wordpress/e2e-test-utils';

/**
 * Internal dependencies
 */
import { deactivateAllOtherPlugins, resetSiteKit } from '../utils';

const oauthClientConfig = JSON.stringify( {
	'web': {
		'client_id': 'test-client-id',
		'client_secret': 'test-client-secret',
		'project_id': 'test-project-id',
		'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
		'token_uri': 'https://accounts.google.com/o/oauth2/token',
		'auth_provider_x509_cert_url': 'https://www.googleapis.com/oauth2/v1/certs'
	}
} );

function stubGoogleSignIn( request ) {
	if ( request.url().startsWith( 'https://accounts.google.com/o/oauth2/auth' ) ) {
		request.respond( {
			status: 302,
			headers: {
				location: createURL( '/', 'oauth2callback=1&code=valid-test-code' )
			}
		} );
	} else {
		request.continue();
	}
}

function logRequest( req ) {
	if ( ! req.url().match( 'wp-json' ) ) {
		return;
	}
	const status = req.response() ? req.response().status() : null;
	const body = req.method().match( /post/i ) ?
		( JSON.parse( req.postData() ) || req.postData() ) :
		'';

	console.log( status, req.method(), req.url(), body );
}

describe( 'Site Kit set up flow for the first time with verification', () => {

	beforeAll( async() => {
		try {
			await deactivateAllOtherPlugins();
			await resetSiteKit();
			await activatePlugin( 'e2e-tests-oauth-callback-plugin' );

			// start
			await visitAdminPage( 'admin.php', 'page=googlesitekit-splash' );
			await page.waitForSelector( '#client-configuration' );

			await page.type( '#client-configuration', oauthClientConfig );
			await page.click( '#wizard-step-one-proceed' );
			await page.waitForSelector( '.googlesitekit-wizard-step--two .mdc-button' );

			// Sign in with Google
			await page.setRequestInterception( true );
			page.on( 'request', stubGoogleSignIn );
			await page.click( '.googlesitekit-wizard-step--two .mdc-button' );
			await page.waitForNavigation();
			page.removeListener( 'request', stubGoogleSignIn );
			await page.setRequestInterception( false );

			page.on( 'request', req => {
				logRequest( req );
			} );
			console.log( 'end beforeAll' );
		} catch ( e ) {
			console.error( 'beforeAll', e );
		}
	} );

	afterAll( async() => {
		try {
			console.log( 'begin afterAll' );
			await deactivateAllOtherPlugins();
			await resetSiteKit();
			console.log( 'end afterAll' );
		} catch ( e ) {
			console.error( 'AfterAll', e );
		}
	} );

	it( 'prompts for confirmation if user is not verified for the site', async() => {
		await console.log( 'begin test' );
		await expect( page ).toMatchElement( '.googlesitekit-wizard-step__title', { text: 'Verify URL' } );

		await console.log( 'waiting for siteProperty element' );
		await page.waitForSelector( '.googlesitekit-wizard-step__inputs [name="siteProperty"]' );

		await console.log( 'waiting for continue button' );
		await page.waitForSelector( '.googlesitekit-wizard-step__action .mdc-button' );

		await Promise.all( [
			page.click( '.googlesitekit-wizard-step__action button' ),
			page.waitForResponse( res => 'http://localhost:9002/wp-json/google-site-kit/v1/modules/search-console/data/insert?_locale=user' === res.url() ),
			page.waitForResponse( res => 'http://localhost:9002/wp-json/google-site-kit/v1/modules/search-console/data/siteverification?_locale=user' === res.url() ),
			page.waitForSelector( '.mdc-linear-progress' ),
		] ).catch( e => {
			console.error( 'Promise.all', e );
		} );

		await page.waitForSelector( '.googlesitekit-wizard-step__action .mdc-button' );

		await expect( page ).toMatchElement( '#doesnotexist' );
	} );
} );

