#!/usr/bin/env node

/**
 * Robust Package Cleanup Script
 * 
 * This script cleans up old Docker container images, attestations, and GitHub Actions caches.
 * It can handle broken/partial bundles from failed deployments and automatically recovers.
 * 
 * Bundle Structure (5 artifacts):
 * - Position 0: Attestation (SHA256 tag only)
 * - Positions 1-3: Build artifacts (untagged)
 * - Position 4: Docker image (semantic tag like "latest" or "v1.0.0")
 */

module.exports = async ({ github, context, core }) => {
    // Get inputs from environment
    const packageName = process.env.INPUT_PACKAGE_NAME.toLowerCase();
    const username = process.env.INPUT_USERNAME.toLowerCase();
    const BUNDLE_SIZE = parseInt(process.env.INPUT_BUNDLE_SIZE || '5');
    const KEEP_SEMANTIC_TAGGED = process.env.INPUT_KEEP_SEMANTIC_TAGGED === 'true';
    const CLEANUP_ATTESTATIONS = process.env.INPUT_CLEANUP_ATTESTATIONS === 'true';
    const CLEANUP_CACHES = process.env.INPUT_CLEANUP_CACHES === 'true';
    const CACHE_RETENTION_DAYS = parseInt(process.env.INPUT_CACHE_RETENTION_DAYS || '7');
    const DRY_RUN = process.env.INPUT_DRY_RUN === 'true';

    console.log(`Package: ${packageName}`);
    console.log(`Username: ${username}\n`);

    try {
        let deletedBundles = 0;
        let deletedArtifacts = 0;
        const deletedImageDigests = [];
        let deletedCaches = 0;
        let totalCacheSize = 0;

        // ============================================================
        // DRY RUN MODE
        // ============================================================
        
        if (DRY_RUN) {
            console.log('🔍'.repeat(30));
            console.log('🔍 DRY RUN MODE - NO ACTUAL DELETIONS 🔍');
            console.log('🔍'.repeat(30));
            console.log('');
        }

        // ============================================================
        // PHASE 1: DOCKER IMAGES
        // ============================================================
        
        console.log('='.repeat(60));
        console.log('PHASE 1: CLEANING UP DOCKER IMAGES (ROBUST MODE)');
        console.log('='.repeat(60));
        console.log('');

        // Fetch all package versions with pagination
        let allVersions = [];
        let page = 1;
        let hasMore = true;

        console.log('Fetching all package versions...');

        while (hasMore) {
            const versions = await github.rest.packages.getAllPackageVersionsForPackageOwnedByUser({
                package_type: 'container',
                package_name: packageName,
                username: username,
                per_page: 100,
                page: page
            });

            allVersions = allVersions.concat(versions.data);
            hasMore = versions.data.length === 100;
            
            console.log(`  Page ${page}: fetched ${versions.data.length} versions`);
            
            page++;

            if (page > 10) {
                console.log('⚠️  Reached safety limit of 10 pages (1000 versions)');
                break;
            }
        }

        // Sort by creation date (newest first)
        allVersions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        console.log(`\nFetched ${allVersions.length} total versions`);

        if (allVersions.length === 0) {
            console.log('No versions found, nothing to clean up');
            return;
        }

        // Helper functions
        const hasOnlySHATags = (tags) => {
            return tags.length > 0 && tags.every(tag => 
                tag.startsWith('sha256-') || tag.startsWith('sha256:')
            );
        };

        const hasSemanticTag = (tags) => {
            return tags.some(tag => 
                !tag.startsWith('sha256-') && !tag.startsWith('sha256:')
            );
        };

        // ============================================================
        // ROBUST BUNDLE IDENTIFICATION
        // ============================================================
        
        console.log('\nIdentifying bundles using semantic tag markers...');
        
        const bundles = [];
        const orphanedVersions = new Set();
        
        // Mark all versions as potentially orphaned
        for (let i = 0; i < allVersions.length; i++) {
            orphanedVersions.add(i);
        }
        
        // Find bundle markers (semantic tags at position 4)
        for (let i = 0; i < allVersions.length; i++) {
            const version = allVersions[i];
            
            if (hasSemanticTag(version.metadata.container.tags)) {
                const bundleStartIdx = i - 4;
                
                if (bundleStartIdx >= 0) {
                    const potentialBundle = {
                        versions: allVersions.slice(bundleStartIdx, i + 1),
                        startIndex: bundleStartIdx,
                        complete: (i - bundleStartIdx + 1) === BUNDLE_SIZE,
                        isNewest: bundles.length === 0
                    };
                    
                    bundles.push(potentialBundle);
                    
                    // Remove from orphaned set
                    for (let j = bundleStartIdx; j <= i; j++) {
                        orphanedVersions.delete(j);
                    }
                    
                    console.log(`  Found bundle at indices ${bundleStartIdx}-${i} (${potentialBundle.complete ? 'complete' : 'INCOMPLETE'})`);
                }
            }
        }
        
        console.log(`\nIdentified ${bundles.length} bundles with semantic tags`);
        console.log(`Found ${orphanedVersions.size} orphaned versions`);
        
        // ============================================================
        // DETECT DEPRECATED BUNDLES
        // ============================================================
        
        if (orphanedVersions.size >= BUNDLE_SIZE) {
            console.log('\nChecking for deprecated bundles among orphaned versions...');
            
            const orphanedIndices = Array.from(orphanedVersions).sort((a, b) => a - b);
            let deprecatedCount = 0;
            
            for (let i = 0; i <= orphanedIndices.length - BUNDLE_SIZE; i++) {
                // Check for consecutive indices
                let isConsecutive = true;
                for (let j = 0; j < BUNDLE_SIZE - 1; j++) {
                    if (orphanedIndices[i + j + 1] !== orphanedIndices[i + j] + 1) {
                        isConsecutive = false;
                        break;
                    }
                }
                
                if (!isConsecutive) continue;
                
                const potentialBundle = {
                    versions: [],
                    startIndex: orphanedIndices[i],
                    complete: true,
                    isNewest: false,
                    deprecated: true
                };
                
                for (let j = 0; j < BUNDLE_SIZE; j++) {
                    potentialBundle.versions.push(allVersions[orphanedIndices[i + j]]);
                }
                
                // Strict validation
                const pos0 = potentialBundle.versions[0];
                const pos4 = potentialBundle.versions[4];
                
                if (!hasOnlySHATags(pos0.metadata.container.tags)) {
                    console.log(`    Rejected: Position 0 invalid tags`);
                    continue;
                }
                
                let hasInvalidMiddle = false;
                for (let k = 1; k <= 3; k++) {
                    if (potentialBundle.versions[k].metadata.container.tags.length > 0) {
                        console.log(`    Rejected: Position ${k} has tags`);
                        hasInvalidMiddle = true;
                        break;
                    }
                }
                if (hasInvalidMiddle) continue;
                
                if (hasSemanticTag(pos4.metadata.container.tags)) {
                    console.log(`    Rejected: Position 4 has semantic tags`);
                    continue;
                }
                
                // Valid deprecated bundle
                for (let j = 0; j < BUNDLE_SIZE; j++) {
                    orphanedVersions.delete(orphanedIndices[i + j]);
                }
                
                bundles.push(potentialBundle);
                deprecatedCount++;
                console.log(`  Found deprecated bundle at indices ${orphanedIndices[i]}-${orphanedIndices[i + BUNDLE_SIZE - 1]}`);
                
                i += BUNDLE_SIZE - 1;
            }
            
            if (deprecatedCount > 0) {
                console.log(`Found ${deprecatedCount} deprecated bundles`);
                console.log(`Remaining orphaned versions: ${orphanedVersions.size}`);
            }
        }
        
        // ============================================================
        // VALIDATE BUNDLES
        // ============================================================
        
        console.log('\nValidating bundle structures...');
        
        for (let i = 0; i < bundles.length; i++) {
            const bundle = bundles[i];
            
            console.log(`\nBundle ${i + 1}:`);
            console.log(`  Complete: ${bundle.complete}`);
            console.log(`  Newest: ${bundle.isNewest}`);
            console.log(`  Deprecated: ${bundle.deprecated || false}`);
            
            if (!bundle.complete) {
                console.log(`  → DELETING (incomplete)`);
                bundle.shouldDelete = true;
                continue;
            }
            
            const pos0 = bundle.versions[0];
            const pos4 = bundle.versions[4];
            
            if (!hasOnlySHATags(pos0.metadata.container.tags)) {
                console.log(`  ⚠️  Invalid position 0`);
                bundle.shouldDelete = true;
                continue;
            }
            
            let hasInvalidMiddle = false;
            for (let j = 1; j <= 3; j++) {
                if (bundle.versions[j].metadata.container.tags.length > 0) {
                    console.log(`  ⚠️  Invalid position ${j}`);
                    hasInvalidMiddle = true;
                }
            }
            if (hasInvalidMiddle) {
                bundle.shouldDelete = true;
                continue;
            }
            
            const tags = pos4.metadata.container.tags;
            
            if (bundle.deprecated) {
                console.log(`  → DELETING (deprecated)`);
                bundle.shouldDelete = true;
            } else if (!hasSemanticTag(tags)) {
                console.log(`  → DELETING (no semantic tag)`);
                bundle.shouldDelete = true;
            } else if (!KEEP_SEMANTIC_TAGGED && !bundle.isNewest) {
                console.log(`  → DELETING (policy)`);
                bundle.shouldDelete = true;
            } else {
                const semanticTags = tags.filter(t => !t.startsWith('sha256'));
                console.log(`  Tags: [${semanticTags.join(', ')}]`);
                console.log(`  → KEEPING`);
                bundle.shouldDelete = false;
            }
        }
        
        // Summary
        const bundlesToDelete = bundles.filter(b => b.shouldDelete);
        const deprecatedToDelete = bundlesToDelete.filter(b => b.deprecated).length;
        const incompleteToDelete = bundlesToDelete.filter(b => !b.complete).length;
        const totalArtifactsToDelete = bundlesToDelete.reduce((sum, b) => sum + b.versions.length, 0) + orphanedVersions.size;
        
        console.log(`\n${'='.repeat(60)}`);
        console.log('DELETION SUMMARY');
        console.log(`${'='.repeat(60)}`);
        console.log(`${DRY_RUN ? 'Would delete' : 'Deleting'} ${bundlesToDelete.length} bundles:`);
        if (deprecatedToDelete > 0) console.log(`  - ${deprecatedToDelete} deprecated`);
        if (incompleteToDelete > 0) console.log(`  - ${incompleteToDelete} incomplete`);
        console.log(`${DRY_RUN ? 'Would delete' : 'Deleting'} ${orphanedVersions.size} orphaned`);
        console.log(`Total: ${totalArtifactsToDelete} artifacts`);
        console.log(`${'='.repeat(60)}\n`);
        
        // ============================================================
        // PERFORM DELETIONS
        // ============================================================
        
        if (bundlesToDelete.length > 0 || orphanedVersions.size > 0) {
            console.log('Performing deletions...\n');
            
            for (const bundle of bundlesToDelete) {
                const dockerImage = bundle.versions[4];
                const digest = dockerImage.name;
                if (digest && digest.startsWith('sha256:')) {
                    deletedImageDigests.push(digest);
                }
                
                for (const version of bundle.versions) {
                    console.log(`  ${DRY_RUN ? 'Would delete' : 'Deleting'}: ${version.id}`);
                    
                    if (!DRY_RUN) {
                        await github.rest.packages.deletePackageVersionForUser({
                            package_type: 'container',
                            package_name: packageName,
                            username: username,
                            package_version_id: version.id
                        });
                    }
                    deletedArtifacts++;
                }
                deletedBundles++;
            }
            
            if (orphanedVersions.size > 0) {
                console.log('\nDeleting orphaned versions:');
                for (const idx of orphanedVersions) {
                    const version = allVersions[idx];
                    console.log(`  ${DRY_RUN ? 'Would delete' : 'Deleting'}: ${version.id}`);
                    
                    if (!DRY_RUN) {
                        await github.rest.packages.deletePackageVersionForUser({
                            package_type: 'container',
                            package_name: packageName,
                            username: username,
                            package_version_id: version.id
                        });
                    }
                    deletedArtifacts++;
                }
            }
        }
        
        console.log(`\n✅ ${DRY_RUN ? 'Would delete' : 'Deleted'} ${deletedBundles} bundles + ${orphanedVersions.size} orphaned (${deletedArtifacts} total)`);
        console.log(`Collected ${deletedImageDigests.length} image digests\n`);

        // ============================================================
        // PHASE 2: ATTESTATIONS
        // ============================================================
        
        if (CLEANUP_ATTESTATIONS && deletedImageDigests.length > 0) {
            console.log('='.repeat(60));
            console.log('PHASE 2: CLEANING UP ATTESTATIONS');
            console.log('='.repeat(60));
            console.log('');
            
            let deletedAttestations = 0;
            let attestationErrors = 0;

            for (const digest of deletedImageDigests) {
                try {
                    console.log(`${DRY_RUN ? 'Would delete' : 'Deleting'} attestations: ${digest.substring(0, 20)}...`);
                    
                    if (!DRY_RUN) {
                        await github.request('DELETE /users/{username}/attestations/digest/{subject_digest}', {
                            username: username,
                            subject_digest: digest,
                            headers: { 'X-GitHub-Api-Version': '2022-11-28' }
                        });
                    }
                    
                    deletedAttestations++;
                    console.log('  ✅ Done');
                } catch (error) {
                    if (error.status === 404) {
                        console.log('  ℹ️  No attestations found');
                    } else {
                        console.log(`  ⚠️  Error: ${error.message}`);
                        attestationErrors++;
                    }
                }
            }
            
            console.log(`\n✅ ${deletedAttestations} attestations deleted`);
            if (attestationErrors > 0) console.log(`⚠️  ${attestationErrors} errors (non-fatal)`);
            console.log('');
        } else if (CLEANUP_ATTESTATIONS) {
            console.log('ℹ️  No image digests, skipping attestation cleanup\n');
        }

        // ============================================================
        // PHASE 3: CACHES
        // ============================================================
        
        if (CLEANUP_CACHES) {
            console.log('='.repeat(60));
            console.log('PHASE 3: CLEANING UP CACHES');
            console.log('='.repeat(60));
            console.log('');
            
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - CACHE_RETENTION_DAYS);
            console.log(`Deleting caches older than ${CACHE_RETENTION_DAYS} days\n`);
            
            let cacheErrors = 0;

            try {
                let cachePage = 1;
                let hasMoreCaches = true;
                
                while (hasMoreCaches) {
                    const caches = await github.rest.actions.getActionsCacheList({
                        owner: context.repo.owner,
                        repo: context.repo.repo,
                        per_page: 100,
                        page: cachePage
                    });
                    
                    console.log(`Page ${cachePage}: ${caches.data.actions_caches.length} caches`);
                    
                    for (const cache of caches.data.actions_caches) {
                        const cacheDate = new Date(cache.created_at);
                        
                        if (cacheDate < cutoffDate) {
                            try {
                                console.log(`  ${DRY_RUN ? 'Would delete' : 'Deleting'}: ${cache.key}`);
                                
                                if (!DRY_RUN) {
                                    await github.rest.actions.deleteActionsCacheById({
                                        owner: context.repo.owner,
                                        repo: context.repo.repo,
                                        cache_id: cache.id
                                    });
                                }
                                
                                deletedCaches++;
                                totalCacheSize += cache.size_in_bytes;
                            } catch (error) {
                                console.log(`    ⚠️  Error: ${error.message}`);
                                cacheErrors++;
                            }
                        }
                    }
                    
                    hasMoreCaches = caches.data.actions_caches.length === 100;
                    cachePage++;
                    
                    if (cachePage > 10) {
                        console.log('⚠️ Safety limit reached');
                        break;
                    }
                }
                
                const sizeMB = (totalCacheSize / 1024 / 1024).toFixed(2);
                console.log(`\n✅ ${deletedCaches} caches deleted (${sizeMB} MB freed)`);
                if (cacheErrors > 0) console.log(`⚠️  ${cacheErrors} errors (non-fatal)`);
                console.log('');
            } catch (error) {
                console.log(`⚠️ Cache cleanup failed: ${error.message}\n`);
            }
        }

        // ============================================================
        // FINAL SUMMARY
        // ============================================================
        
        console.log('='.repeat(60));
        console.log('CLEANUP SUMMARY');
        if (DRY_RUN) console.log('(DRY RUN - NO ACTUAL DELETIONS)');
        console.log('='.repeat(60));
        console.log(`Docker Images:  ${deletedBundles} bundles (${deletedArtifacts} artifacts)`);
        if (CLEANUP_ATTESTATIONS) console.log(`Attestations:   ${deletedImageDigests.length} digests`);
        if (CLEANUP_CACHES) console.log(`Caches:         ${deletedCaches}`);
        console.log('='.repeat(60));

    } catch (error) {
        console.log(`\n⚠️ Cleanup failed: ${error.message}`);
        console.log(`Stack trace: ${error.stack}`);
        core.setFailed(`Cleanup failed: ${error.message}`);
    }
};
