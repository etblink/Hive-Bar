@{
    Release = @{
        Milestone = 'C2-D.1'
        OldCommit = 'ba13470f0e79f5704f229774a6c8aacc23e358f4'
        OldTree = 'c953995ccf1eb2cf01d63eb5d0ffedba7f904ef9'
        OldBuild = 'beta-ba13470'
        NewCommit = '5f3fbaea0395f583435d901ccc7faa0801240e7a'
        NewTree = '08fa1ca6e871f32430550f2a24f7f8788f68a62e'
        ExpectedBuild = 'beta-5f3fbae'
    }

    GitHub = @{
        Repository = 'etblink/Hive-Bar'
        RequireMainCommit = $true
        CiRunId = 32539607927
        CiRunNumber = 250
    }

    Production = @{
        Host = '23.145.40.126'
        RemoteUser = 'debian'
        SshKeyPath = '~/.ssh/hivebar_privex_ed25519'
        KnownHostsPath = '~/.ssh/hivebar_privex_known_hosts'
        PublicOrigin = 'https://fourthstreetbar.com'
        Service = 'hive-bar.service'
        HealthTimer = 'hive-bar-healthcheck.timer'
        DeployHelper = '/usr/local/sbin/hive-bar-deploy'
        CurrentLink = '/opt/hive-bar/current'
        LastGoodLink = '/opt/hive-bar/last-good'
        ReleaseRoot = '/opt/hive-bar/releases'
        NodePath = '/usr/local/bin/node'
    }

    Environment = @{
        ActivePath = '/etc/hive-bar/hive-bar.env'
        ReadOnlyPath = '/etc/hive-bar/hive-bar.env.m16-beta-read-only'
        PreservedBetaPath = '/etc/hive-bar/hive-bar.env.c2-d1-media-beta-preserved'
        BetaSha256 = '859c5808e16b1fbe273d21f6258099e127f5d9f072bfc5b82bd5957938c284b2'
        ReadOnlySha256 = 'cb8a5895b1d2f06500b5071bc32251b8aa4a3f82f9d138a5806b4c9917ce3868'
    }

    Qualification = @{
        ReadOnlyGateScript = 'scripts/check-privex-release.js'
        BetaGateScript = 'scripts/check-beta-release.js'

        ExpectedBetaActions = @(
            'post', 'comment', 'vote', 'follow', 'unfollow', 'subscribe',
            'unsubscribe', 'profile', 'claim-rewards', 'wall', 'inbox', 'thread'
        )

        SourceChecks = @(
            @{
                Path = 'public/js/image-upload.js'
                Contains = @(
                    "const IMAGE_HOST = 'https://images.hive.blog';",
                    'const MAX_IMAGE_BYTES = 10 * 1024 * 1024;',
                    'lockedAmbiguous',
                    'ImageSigningChallenge',
                    'The post has not been sent to Hive.'
                )
                NotContains = @()
            }
            @{
                Path = 'views/common/image-upload.ejs'
                Contains = @(
                    'Choosing a file stays local until you press Upload image.',
                    'maxlength="160"'
                )
                NotContains = @()
            }
            @{
                Path = 'src/hive/social-operations.js'
                Contains = @(
                    "parsed.hostname !== 'images.hive.blog'",
                    'metadataWithImage'
                )
                NotContains = @()
            }
            @{
                Path = 'src/app.js'
                Contains = @(
                    'https://images.hive.blog'
                )
                NotContains = @()
            }
            @{
                Path = 'src/release/static-assets.js'
                Contains = @(
                    "'/js/image-upload.js'",
                    "'/css/c2-d-media.css'"
                )
                NotContains = @()
            }
            @{
                Path = 'public/css/c2-d-media.css'
                Contains = @(
                    '.image-upload {',
                    '.social-post__media {'
                )
                NotContains = @()
            }
        )

        PublicChecks = @(
            @{
                Name = 'health'
                Kind = 'Json'
                Path = '/healthz'
                Expected = @{
                    status = 'ok'
                    environment = 'production'
                    writeMode = 'beta'
                    build = 'beta-5f3fbae'
                    commit = '5f3fbaea0395f583435d901ccc7faa0801240e7a'
                    tree = '08fa1ca6e871f32430550f2a24f7f8788f68a62e'
                }
            }
            @{
                Name = 'ready'
                Kind = 'Json'
                Path = '/readyz'
                Expected = @{
                    status = 'ready'
                }
            }
            @{
                Name = 'home-csp'
                Kind = 'Html'
                Path = '/'
                Contains = @('beta-5f3fbae')
                AnyContains = @()
                NotContains = @()
                ContainsHeader = @{
                    'Content-Security-Policy' = "connect-src 'self' https://images.hive.blog"
                }
            }
            @{
                Name = 'image-js'
                Kind = 'Html'
                Path = '/js/image-upload.js'
                Contains = @(
                    'ImageSigningChallenge',
                    'lockedAmbiguous',
                    'MAX_IMAGE_BYTES',
                    'images.hive.blog',
                    'The post has not been sent to Hive.'
                )
                AnyContains = @()
                NotContains = @()
                ContainsHeader = @{}
            }
            @{
                Name = 'media-css'
                Kind = 'Html'
                Path = '/css/c2-d-media.css'
                Contains = @(
                    '.image-upload {',
                    '.social-post__media {',
                    '@media (max-width: 520px)'
                )
                AnyContains = @()
                NotContains = @()
                ContainsHeader = @{}
            }
            @{
                Name = 'community'
                Kind = 'Html'
                Path = '/community'
                Contains = @('/css/c2-d-media.css')
                AnyContains = @()
                NotContains = @()
                ContainsHeader = @{}
            }
            @{
                Name = 'threads'
                Kind = 'Html'
                Path = '/community/threads'
                Contains = @()
                AnyContains = @('class="thread-feed"', 'No threads yet')
                NotContains = @()
                ContainsHeader = @{}
            }
            @{
                Name = 'wallet-regression'
                Kind = 'Html'
                Path = '/profile/etblink/wallet'
                Contains = @(
                    'data-c2c1-surface="wallet"',
                    'Your bar level',
                    'Your pitcher',
                    'Activity capacity'
                )
                AnyContains = @()
                NotContains = @()
                ContainsHeader = @{}
            }
            @{
                Name = 'onboarding-inert'
                Kind = 'Html'
                Path = '/create-account'
                Contains = @('onboarding-not-active-heading')
                AnyContains = @()
                NotContains = @('data-onboarding-customer')
                ContainsHeader = @{}
            }
        )
    }
}
