Name:           tobira
Version:        %{tobira_version}
Release:        1%{?dist}
Summary:        A modern web frontend for Opencast

License:        Apache-2.0
URL:            https://github.com/elan-ev/tobira
Source0:        tobira-x86_64-unknown-linux-gnu
Source1:        config.toml
Source2:        tobira.service
Source3:        tobira-worker.service
Source4:        LICENSE
Source5:        README.md

BuildArch:      x86_64
Requires:       glibc

%description
Tobira is a modern, user-friendly web interface for Opencast. It allows
you to browse, search, and watch media published in Opencast.

For changelog and release notes, see:
  https://github.com/elan-ev/tobira/releases

%prep

%build

%pre
getent group tobira >/dev/null || groupadd -r tobira
getent passwd tobira >/dev/null || useradd -r -M -g tobira -s /sbin/nologin tobira

%install
mkdir -p %{buildroot}%{_bindir}
install -m 0755 %{SOURCE0} %{buildroot}%{_bindir}/tobira

mkdir -p %{buildroot}/etc/tobira
install -m 0644 %{SOURCE1} %{buildroot}/etc/tobira/config.toml

mkdir -p %{buildroot}/var/log/tobira

mkdir -p %{buildroot}/var/lib/tobira

mkdir -p %{buildroot}/usr/lib/systemd/system
install -m 0644 %{SOURCE2} %{buildroot}/usr/lib/systemd/system/tobira.service
install -m 0644 %{SOURCE3} %{buildroot}/usr/lib/systemd/system/tobira-worker.service

mkdir -p %{buildroot}%{_licensedir}
install -m 0644 %{SOURCE4} %{buildroot}%{_licensedir}/%{name}

mkdir -p %{buildroot}%{_docdir}/%{name}-%{version}
install -m 0644 %{SOURCE5} %{buildroot}%{_docdir}/%{name}-%{version}/

%post
echo "====================================================================="
echo "IMPORTANT: Tobira requires PostgreSQL and Meilisearch to be installed."
echo "Please refer to the documentation for version %{tobira_version}:"
echo "  https://elan-ev.github.io/tobira/setup/requirements"
echo "====================================================================="

%systemd_daemon_reload

%preun
%systemd_preun tobira.service
%systemd_preun tobira-worker.service

%postun
%systemd_postun_with_restart tobira.service
%systemd_postun_with_restart tobira-worker.service

%files
%attr(0755, tobira, tobira) %{_bindir}/tobira
%dir %attr(0755, tobira, tobira) /var/log/tobira
%dir %attr(0755, tobira, tobira) /var/lib/tobira
%config(noreplace) %attr(0644, tobira, tobira) /etc/tobira/config.toml
%config(noreplace) /usr/lib/systemd/system/tobira.service
%config(noreplace) /usr/lib/systemd/system/tobira-worker.service
%license %{_licensedir}/%{name}
%doc %{_docdir}/%{name}-%{version}/README.md