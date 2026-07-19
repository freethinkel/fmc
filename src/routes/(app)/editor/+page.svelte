<script>
	import { EditorPage } from '$lib/modules/editor/pages';
	import { editorModel } from '$lib/modules/editor/model';

	window.wfEd = editorModel; // console access for debugging/automated runs
</script>

<svelte:head><title>Editor — FCM Watchfaces</title></svelte:head>

<EditorPage />
