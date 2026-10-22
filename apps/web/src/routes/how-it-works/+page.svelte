<script>
	import { t } from '#lib/i18n/index.js';
</script>

<svelte:head>
	<title>{$t('meta.title_how')}</title>
</svelte:head>

<h1>{$t('how.title')}</h1>

<h2>{$t('how.states_h')}</h2>
<p>
	<span class="pill open">{$t('home.pill_open')}</span> {$t('how.states_open')}
	<span class="pill quiet">{$t('home.pill_quiet')}</span> {$t('how.states_quiet')}
	<span class="pill observer">{$t('home.pill_observer')}</span> {$t('how.states_observer')}
	<strong>{$t('home.pill_invisible')}</strong> {$t('how.states_invisible')}
</p>

<h2>{$t('how.see_h')}</h2>
<p>{$t('how.see_p')}</p>

<h2>{$t('how.mutual_h')}</h2>
<p>{$t('how.mutual_p')}</p>

<h2>{$t('how.compass_h')}</h2>
<p>{$t('how.compass_p')}</p>

<h2>{$t('how.device_h')}</h2>
<p>{$t('how.device_p')}</p>
