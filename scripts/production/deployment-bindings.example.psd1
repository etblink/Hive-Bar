@{
    Release = @{
        Milestone = 'C2-X'
        OldCommit = '0000000000000000000000000000000000000000'
        OldTree = '0000000000000000000000000000000000000000'
        OldBuild = 'beta-0000000'
        NewCommit = '1111111111111111111111111111111111111111'
        NewTree = '1111111111111111111111111111111111111111'
        ExpectedBuild = 'beta-1111111'
    }

    GitHub = @{
        Repository = 'etblink/Hive-Bar'
        RequireMainCommit = $true
        CiRunId = 1
        CiRunNumber = 1
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
        PreservedBetaPath = '/etc/hive-bar/hive-bar.env.c2-x-beta-preserved'
        BetaSha256 = '2222222222222222222222222222222222222222222222222222222222222222'
        ReadOnlySha256 = '3333333333333333333333333333333333333333333333333333333333333333'
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
                Path = 'path/to/release-file.js'
                Contains = @('release-specific marker')
                NotContains = @()
            }
        )

        # Public checks are intentionally release-specific. Do not assert authenticated
        # controls from anonymous requests unless the route contract actually guarantees them.
        PublicChecks = @(
            @{
                Name = 'health'
                Kind = 'Json'
                Path = '/healthz'
                Expected = @{
                    status = 'ok'
                    environment = 'production'
                    writeMode = 'beta'
                    build = 'beta-1111111'
                    commit = '1111111111111111111111111111111111111111'
                    tree = '1111111111111111111111111111111111111111'
                }
            }
            @{
                Name = 'example-html'
                Kind = 'Html'
                Path = '/'
                Contains = @('release-specific public marker')
                AnyContains = @()
                NotContains = @()
                ContainsHeader = @{}
            }
        )
    }
}
