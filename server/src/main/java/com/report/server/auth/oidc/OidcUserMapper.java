package com.report.server.auth.oidc;

import com.nimbusds.jwt.JWTClaimsSet;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Maps verified token claims to a report-studio identity (#499).
 *
 * <ul>
 *   <li>{@code externalId} = {@code sub} (stable IdP key, stored on the user record)
 *   <li>{@code userId} = {@code preferred_username} when it satisfies the local user-id charset,
 *       otherwise {@code sub}
 *   <li>{@code displayName} = {@code name} → {@code preferred_username} → {@code sub}
 *   <li>roles: {@code OIDC_ADMIN_ROLE} present → {@code admin}+{@code user}; otherwise {@code user}
 *       — unless {@code OIDC_USER_ROLE} is configured and absent, in which case the login is
 *       refused ({@link MappedUser#allowed()} = false)
 * </ul>
 */
public final class OidcUserMapper {

    /** Same charset AdminUserController accepts for local user ids. */
    private static final Pattern USERID_PATTERN = Pattern.compile("^[a-zA-Z0-9._@-]{1,64}$");

    public record MappedUser(
            String externalId,
            String userId,
            String displayName,
            Set<String> roles,
            boolean allowed) {}

    private final OidcConfig cfg;

    public OidcUserMapper(OidcConfig cfg) {
        this.cfg = cfg;
    }

    public MappedUser map(JWTClaimsSet claims) {
        return map(claims, null);
    }

    /**
     * @param claims verified ID token (or Bearer access token) — identity source
     * @param roleClaims optional second verified token whose role claim is merged in (the access
     *     token that accompanied the ID token); {@code null} to use {@code claims} only
     */
    public MappedUser map(JWTClaimsSet claims, JWTClaimsSet roleClaims) {
        String sub = claims.getSubject();
        String preferred = stringClaim(claims, "preferred_username");
        String userId =
                preferred != null && USERID_PATTERN.matcher(preferred).matches() ? preferred : sub;
        String name = stringClaim(claims, "name");
        String displayName = name != null ? name : (preferred != null ? preferred : sub);

        Set<String> idpRoles =
                new LinkedHashSet<>(extractRoles(claims.getClaims(), cfg.roleClaim()));
        if (roleClaims != null) {
            idpRoles.addAll(extractRoles(roleClaims.getClaims(), cfg.roleClaim()));
        }
        boolean admin = idpRoles.contains(cfg.adminRole());
        boolean user = admin || !cfg.requiresUserRole() || idpRoles.contains(cfg.userRole());
        Set<String> roles = admin ? Set.of("admin", "user") : (user ? Set.of("user") : Set.of());
        return new MappedUser(sub, userId, displayName, roles, user);
    }

    private static String stringClaim(JWTClaimsSet claims, String name) {
        Object v = claims.getClaim(name);
        if (v instanceof String s && !s.isBlank()) return s;
        return null;
    }

    /** Walks a dot path ({@code realm_access.roles}) into the claims map; missing → empty set. */
    @SuppressWarnings("unchecked")
    static Set<String> extractRoles(Map<String, Object> claims, String path) {
        Object cur = claims;
        for (String seg : path.split("\\.")) {
            if (!(cur instanceof Map<?, ?> m)) return Set.of();
            cur = ((Map<String, Object>) m).get(seg);
            if (cur == null) return Set.of();
        }
        Set<String> out = new LinkedHashSet<>();
        if (cur instanceof Collection<?> c) {
            for (Object o : c) if (o != null) out.add(o.toString());
        } else if (cur instanceof String s) {
            for (String part : List.of(s.split("[\\s,]+"))) if (!part.isBlank()) out.add(part);
        }
        return out;
    }
}
