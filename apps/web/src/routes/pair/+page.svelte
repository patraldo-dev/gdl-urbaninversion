<script>
	import { t } from '#lib/i18n/index.js';
</script>

<svelte:head>
	<title>{$t('meta.title_pair')}</title>
</svelte:head>

<h1>{$t('pair.title')}</h1>

<p class="lede">{$t('pair.lede')}</p>

<h2>{$t('pair.why_h')}</h2>
<p>{$t('pair.why_p')}</p>

<h2>{$t('pair.what_h')}</h2>
<p>{$t('pair.what_p')}</p>
