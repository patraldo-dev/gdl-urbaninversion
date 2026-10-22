<script>
	import { t } from '#lib/i18n/index.js';
</script>

<svelte:head>
	<title>{$t('meta.title_privacy')}</title>
</svelte:head>

<h1>{$t('privacy.title')}</h1>

<p class="lede">{$t('privacy.lede')}</p>

<h2>{$t('privacy.short_h')}</h2>
<p>{$t('privacy.short_p')}</p>

<h2>{$t('privacy.identity_h')}</h2>
<p>{$t('privacy.identity_p')}</p>

<h2>{$t('privacy.location_h')}</h2>
<p>{$t('privacy.location_p')}</p>

<h2>{$t('privacy.others_h')}</h2>
<p>{$t('privacy.others_p')}</p>

<h2>{$t('privacy.stats_h')}</h2>
<p>{$t('privacy.stats_p')}</p>

<h2>{$t('privacy.limits_h')}</h2>
<ul>
	<li>{$t('privacy.limit_1')}</li>
	<li>{$t('privacy.limit_2')}</li>
	<li>{$t('privacy.limit_3')}</li>
</ul>

<h2>{$t('privacy.controls_h')}</h2>
<p>
	{$t('privacy.controls_p_a')}
	<a href="mailto:hello@urbaninversion.com">{$t('privacy.email')}</a>.
</p>
